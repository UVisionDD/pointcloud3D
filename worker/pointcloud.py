"""Depth map + source image -> 3D point cloud for inner-crystal laser engraving.

Crystal engraving physics (summary):
- Laser fires focused pulses that create micro-fractures inside the crystal.
- Each point in the cloud becomes one fracture point. No point == clear crystal.
- Each fracture scatters incident light, so it reads as a bright white dot.
- More fractures in a region => that region looks brighter / more opaque.
- So: bright source pixel => dense cloud (bright in the crystal).
        dark source pixel  => sparse cloud (clear crystal).

Good subsurface engravers *also* modulate per-point laser power by the source
luminance so highlights aren't just dense, they're also slightly brighter per
point. xTool Studio, HAOTIAN and most modern subsurface software accept an
`intensity` scalar per point for exactly this. Historically we only emitted
(x, y, z); we now emit (x, y, z, intensity) where intensity is the tonemapped
source luminance in 0..1.
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
    # Per-layer Bernoulli probability scalar. Each (pixel, layer) draws a
    # Bernoulli(density × base_density × falloff). Total expected count is
    #   E[points] ≈ pixels × mean(density) × base_density × layers × falloff_avg
    # where layers = volumetric_thickness_mm / layer_height_mm, so smaller
    # layer_height genuinely lifts the count (linear in 1/layer_height) and
    # brightness/contrast/gamma feed mean(density) so the tonemap sliders
    # also move the total. 0.012 lands a 4 MP portrait at ~0.03 mm in the
    # 500k–1M range after bg removal; bump to ~0.025 for denser clouds.
    base_density: float = 0.012
    # Random XY jitter (in fraction of pixel spacing) to break grid artifacts.
    xy_jitter: float = 0.5
    # Layer height in mm — the primary control for both vertical resolution
    # AND total point count. Smaller layer height => more layers => more
    # points (linear). UI range is 0.01–0.30 mm: 0.01 is industrial-fiber
    # pitch, 0.03 is a fine portrait setting, 0.10 is a balanced default,
    # 0.30 is a draft. When > 0, overrides `z_layers` by computing
    # layers = round(volumetric_thickness_mm / layer_height_mm).
    layer_height_mm: float = 0.10
    # Legacy / override: explicit number of Z slabs. Only used when
    # `layer_height_mm <= 0`; otherwise we derive it from layer_height_mm.
    z_layers: int = 6
    # Cap the longest source image dimension before depth + sampling, so the
    # output point count is predictable. 2500 px ≈ 6 MP, target ~2 M points
    # for a typical portrait. Set 0 to disable the cap entirely.
    sampling_max_side_px: int = 2500
    # How much later Z layers fall off relative to the main surface layer.
    # 0.2 means the last layer still emits 80% as many points — prevents
    # the volumetric shell from looking hollow. Previously was 0.5 which
    # collectively halved the total cloud size.
    layer_falloff: float = 0.2
    # Volumetric thickness around the depth surface (fraction of size_z, 0..1).
    volumetric_thickness: float = 0.08
    # Z scale: 0..1. Scales how much of crystal depth the shape occupies.
    # 0.25 keeps portraits visibly flat on an 80mm-long crystal. Landscape
    # presets override this upward because horizon depth is the point.
    z_scale: float = 0.25

    # Tonemap knobs on the source image (applied before density sampling).
    brightness: float = 0.0    # -1..1 additive
    contrast: float = 1.0      # >1 = more contrast
    gamma: float = 1.0         # <1 brightens midtones, >1 darkens

    # Depth curve tuning.
    # Invert so that closer = higher Z (standard for crystal engraving).
    invert_depth: bool = True
    # Gamma applied to normalized depth. <1 pushes details forward.
    depth_gamma: float = 1.0

    # Intensity curve. Applied to the tonemapped luminance before writing it
    # into the 4th column (and into per-point RGB for viewers). >1 darkens,
    # <1 brightens. Useful to bias burn power for particular laser tubes.
    intensity_gamma: float = 1.0
    # Floor so very-dark-but-still-present points aren't totally invisible
    # in the viewer. Bumps the minimum intensity towards this value.
    intensity_floor: float = 0.12

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
    """Return (N, 4) float32 array of [X_mm, Y_mm, Z_mm, intensity_0to1] points.

    image_rgb: (H, W, 3) uint8 in 0..255.
    depth: (H, W) float32, relative depth from Depth Anything V2.

    The 4th column (intensity, 0..1) is the tonemapped source luminance at the
    pixel that spawned each point. Exporters turn this into:
      - PLY: per-vertex grayscale colour (so the browser viewer can shade)
             and a `scalar_intensity` property for CAM tools.
      - XYZ: a 4th column of 0..1 values.
      - STL: size of the per-point tetrahedron.
      - GLB: per-vertex colour.
    Laser software that only reads XYZ ignores the 4th column harmlessly.
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
    nonzero_lum = int((density > 0.01).sum())
    print(f"[pointcloud] image {w}x{h} = {w*h} px, "
          f"lum mean={float(lum.mean()):.3f}, "
          f"density mean={float(density.mean()):.3f}, "
          f"pixels>0.01: {nonzero_lum} ({100*nonzero_lum/(w*h):.1f}%)")

    # Intensity map: same tonemap as density, with its own gamma + a floor so
    # dark-but-present points still show up (0 intensity == invisible in most
    # viewers and would be a wasted laser pulse).
    if params.intensity_gamma != 1.0:
        intensity_map = np.power(density, params.intensity_gamma)
    else:
        intensity_map = density.copy()
    if params.intensity_floor > 0:
        intensity_map = np.clip(
            params.intensity_floor + (1.0 - params.intensity_floor) * intensity_map,
            0.0, 1.0,
        )

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

    # Derive layer count from layer_height_mm when supplied. This matches the
    # photopoints3d UX: user picks a vertical resolution in mm and the output
    # density emerges from (layers × per-pixel-prob × bright pixels). The
    # legacy `z_layers` field is only consulted when layer_height_mm <= 0.
    if params.layer_height_mm > 0:
        layers = max(1, int(round(vol_thickness_mm / params.layer_height_mm)))
        print(f"[pointcloud] layer_height={params.layer_height_mm:.3f}mm "
              f"× thickness={vol_thickness_mm:.2f}mm => {layers} layers")
    else:
        layers = max(1, params.z_layers)
    all_points: list[np.ndarray] = []

    # Pure Bernoulli per (pixel, layer). No target boost, no per-pixel cap —
    # the count emerges from layer_count × tonemapped luminance × base_density,
    # so tonemap sliders and layer_height are the only controls that move it.
    for layer_idx in range(layers):
        # Each additional layer is slightly less dense, roughly modeling the
        # taper of the volumetric shell around the main depth surface.
        # `layer_falloff` is the *total* drop from layer 0 to layer N-1:
        # e.g. 0.2 means the last layer still fires at 80% of the first.
        falloff = (
            1.0 if layers == 1
            else 1.0 - params.layer_falloff * (layer_idx / (layers - 1))
        )
        layer_p = density * params.base_density * falloff
        layer_p = np.clip(layer_p, 0.0, 1.0)

        mask = rng.random((h, w)) < layer_p
        ys, xs = np.nonzero(mask)
        print(f"[pointcloud]   layer {layer_idx}: "
              f"p_mean={float(layer_p.mean()):.3f}, "
              f"p_max={float(layer_p.max()):.3f}, "
              f"emitted={int(xs.size)}")
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

        inten = intensity_map[ys, xs]

        pts = np.stack([x_mm, y_mm, z_mm, inten], axis=1).astype(np.float32)
        all_points.append(pts)

    if not all_points:
        return np.zeros((0, 4), dtype=np.float32)
    return np.concatenate(all_points, axis=0)
