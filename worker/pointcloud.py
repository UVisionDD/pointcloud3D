"""Depth map + source image -> 3D point cloud for inner-crystal laser engraving.

Crystal engraving physics (summary):
- Laser fires focused pulses that create micro-fractures inside the crystal.
- Each point in the cloud becomes one fracture point. No point == clear crystal.
- Brighter source pixels => more fracture points (denser cloud in that region).
- Dark/black source pixels => no points (transparent region in the crystal).

So the cloud is density-modulated by image brightness, positioned in XY by the
pixel grid, and in Z by the depth map.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class CrystalParams:
    # Crystal target size in mm.
    size_x: float = 50.0
    size_y: float = 50.0
    size_z: float = 80.0

    # Margin inside the crystal (mm) so the cloud doesn't touch the faces.
    margin_x: float = 3.0
    margin_y: float = 3.0
    margin_z: float = 3.0

    # Density / distribution.
    # Probability (0-1) that a fully-white pixel emits a point at base layer.
    base_density: float = 0.35
    # Max number of points a single pixel can emit across all Z layers.
    max_points_per_pixel: int = 4
    # Random XY jitter (in fraction of pixel spacing) to break grid artifacts.
    xy_jitter: float = 0.5
    # Number of Z layers to sample (volumetric thickness in Z).
    z_layers: int = 3
    # Volumetric thickness around the depth surface (fraction of size_z, 0..1).
    volumetric_thickness: float = 0.08
    # Z scale: 0..1. Scales how much of crystal depth the shape occupies.
    z_scale: float = 0.85

    # Tonemap knobs on the source image (applied before density sampling).
    brightness: float = 0.0    # -1..1 additive
    contrast: float = 1.0      # >1 = more contrast
    gamma: float = 1.0         # <1 brightens midtones, >1 darkens

    # Depth curve tuning.
    # Invert so that closer = higher Z (standard for crystal engraving).
    invert_depth: bool = True
    # Gamma applied to normalized depth. <1 pushes details forward.
    depth_gamma: float = 1.0

    # Deterministic output.
    seed: int = 42


def _tonemap(gray: np.ndarray, p: CrystalParams) -> np.ndarray:
    """Apply brightness/contrast/gamma to a 0..1 grayscale array."""
    x = np.clip(gray + p.brightness, 0.0, 1.0)
    x = np.clip((x - 0.5) * p.contrast + 0.5, 0.0, 1.0)
    if p.gamma != 1.0:
        x = np.power(x, p.gamma)
    return x


def _normalize_depth(depth: np.ndarray, p: CrystalParams) -> np.ndarray:
    """Normalize to 0..1, optionally invert, apply depth gamma."""
    dmin, dmax = float(depth.min()), float(depth.max())
    if dmax - dmin < 1e-8:
        return np.zeros_like(depth, dtype=np.float32)
    d = (depth - dmin) / (dmax - dmin)
    if p.invert_depth:
        d = 1.0 - d
    if p.depth_gamma != 1.0:
        d = np.power(d, p.depth_gamma)
    return d.astype(np.float32)


def generate_points(
    image_rgb: np.ndarray,
    depth: np.ndarray,
    params: CrystalParams,
) -> np.ndarray:
    """Return (N, 3) float32 array of XYZ points in millimetres.

    image_rgb: (H, W, 3) uint8 in 0..255.
    depth: (H, W) float32, relative depth from Depth Anything V2.
    """
    if image_rgb.shape[:2] != depth.shape:
        raise ValueError(
            f"Image shape {image_rgb.shape[:2]} != depth shape {depth.shape}"
        )

    rng = np.random.default_rng(params.seed)
    h, w = depth.shape

    # Grayscale luminance 0..1 (Rec. 709).
    r, g, b = image_rgb[..., 0], image_rgb[..., 1], image_rgb[..., 2]
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
    density = _tonemap(lum.astype(np.float32), params)

    depth_norm = _normalize_depth(depth.astype(np.float32), params)

    # Fit the content into the crystal volume minus margins.
    inner_x = params.size_x - 2 * params.margin_x
    inner_y = params.size_y - 2 * params.margin_y
    inner_z = params.size_z - 2 * params.margin_z

    # Preserve source aspect ratio inside the inner XY area.
    aspect_img = w / h
    aspect_inner = inner_x / inner_y
    if aspect_img > aspect_inner:
        span_x = inner_x
        span_y = inner_x / aspect_img
    else:
        span_y = inner_y
        span_x = inner_y * aspect_img
    origin_x = params.margin_x + (inner_x - span_x) / 2.0
    origin_y = params.margin_y + (inner_y - span_y) / 2.0
    px_mm = span_x / w  # mm per pixel (isotropic)

    vol_thickness_mm = params.volumetric_thickness * inner_z
    z_base = params.margin_z + (inner_z - inner_z * params.z_scale) / 2.0

    # For each layer, draw a Bernoulli mask over pixels with p = density * base.
    layers = max(1, params.z_layers)
    all_points: list[np.ndarray] = []

    for layer_idx in range(layers):
        layer_p = density * params.base_density
        # Each additional layer is slightly less dense, roughly modeling the
        # taper of the volumetric shell around the main depth surface.
        layer_falloff = 1.0 if layers == 1 else 1.0 - 0.5 * (layer_idx / (layers - 1))
        layer_p = layer_p * layer_falloff * (params.max_points_per_pixel / layers)
        layer_p = np.clip(layer_p, 0.0, 1.0)

        mask = rng.random((h, w)) < layer_p
        ys, xs = np.nonzero(mask)
        if xs.size == 0:
            continue

        jitter_x = (rng.random(xs.size) - 0.5) * params.xy_jitter
        jitter_y = (rng.random(ys.size) - 0.5) * params.xy_jitter

        x_mm = origin_x + (xs + 0.5 + jitter_x) * px_mm
        # Flip Y so top of image is high Y in crystal space.
        y_mm = origin_y + ((h - 1 - ys) + 0.5 + jitter_y) * px_mm

        d = depth_norm[ys, xs]
        z_surface = z_base + d * inner_z * params.z_scale
        z_offset = (rng.random(xs.size) - 0.5) * vol_thickness_mm
        z_mm = z_surface + z_offset

        pts = np.stack([x_mm, y_mm, z_mm], axis=1).astype(np.float32)
        all_points.append(pts)

    if not all_points:
        return np.zeros((0, 3), dtype=np.float32)
    return np.concatenate(all_points, axis=0)
