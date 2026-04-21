"""Preset library for subject type (Portrait/Pet/etc.) and laser vendor.

All numbers here are first-pass defaults intended to be tuned against real
crystal test samples. Keep them in one place so the web UI and the worker
agree on what "Portrait + xTool F1 Ultra" actually means.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from pointcloud import CrystalParams


# ---------- Content presets (subject type) ----------

# All presets were re-tuned to target ~500k–1.5M points and tighter Z so the
# crystal doesn't look stretched on its long axis. Density was previously too
# conservative (0.22–0.32) which — combined with hard bg-removal zeroing out
# 60%+ of pixels — dropped the real output to <20k points on portraits.
CONTENT_PRESETS: dict[str, CrystalParams] = {
    # More face-detail bias, tighter Z range, higher contrast on skin tones.
    # Target ~800k–1.2M points.
    "portrait": CrystalParams(
        base_density=0.85,
        max_points_per_pixel=10,
        xy_jitter=0.5,
        z_layers=5,
        volumetric_thickness=0.06,
        z_scale=0.38,
        contrast=1.15,
        gamma=0.95,
        depth_gamma=0.85,
    ),
    # Pets are furrier so higher density; z_scale slightly more forward.
    "pet": CrystalParams(
        base_density=0.9,
        max_points_per_pixel=10,
        xy_jitter=0.55,
        z_layers=5,
        volumetric_thickness=0.08,
        z_scale=0.45,
        contrast=1.1,
        gamma=1.0,
        depth_gamma=0.9,
    ),
    # Landscapes use the full Z range — horizon depth is the point.
    "landscape": CrystalParams(
        base_density=0.95,
        max_points_per_pixel=10,
        xy_jitter=0.5,
        z_layers=6,
        volumetric_thickness=0.12,
        z_scale=0.7,
        contrast=1.05,
        gamma=1.0,
        depth_gamma=1.0,
    ),
    # Objects usually have dark background, effective lum lower — compensate.
    "object": CrystalParams(
        base_density=0.85,
        max_points_per_pixel=10,
        xy_jitter=0.5,
        z_layers=5,
        volumetric_thickness=0.08,
        z_scale=0.48,
        contrast=1.1,
        gamma=1.0,
        depth_gamma=0.95,
    ),
    # Text/logo is mostly dark pixels w/ dense bright strokes; tighten Z.
    "text_logo": CrystalParams(
        base_density=0.9,
        max_points_per_pixel=10,
        xy_jitter=0.3,
        z_layers=4,
        volumetric_thickness=0.04,
        z_scale=0.28,
        contrast=1.5,
        gamma=0.85,
        depth_gamma=1.2,
    ),
}


# ---------- Laser presets (vendor defaults for size + format) ----------

@dataclass(frozen=True)
class LaserPreset:
    name: str
    vendor: str
    default_format: str            # stl / glb / dxf
    crystal_size_xyz_mm: tuple[float, float, float]
    notes: str


LASER_PRESETS: dict[str, LaserPreset] = {
    "xtool_f1_ultra": LaserPreset(
        name="xTool F1 Ultra",
        vendor="xTool",
        default_format="glb",
        crystal_size_xyz_mm=(50.0, 50.0, 80.0),
        notes="xTool Creative Space consumes GLB with POINTS primitive natively.",
    ),
    "haotian_x1": LaserPreset(
        name="Haotian X1",
        vendor="Haotian",
        default_format="stl",
        crystal_size_xyz_mm=(50.0, 50.0, 80.0),
        notes="RK-CAD expects STL; each point as a tiny tetrahedron.",
    ),
    "commarker_b4_jpt": LaserPreset(
        name="Commarker B4 JPT",
        vendor="Commarker",
        default_format="stl",
        crystal_size_xyz_mm=(50.0, 50.0, 80.0),
        notes="BSL / EZCAD-driven; STL point clouds.",
    ),
    "rock_solid": LaserPreset(
        name="Rock Solid",
        vendor="Rock Solid",
        default_format="stl",
        crystal_size_xyz_mm=(50.0, 50.0, 80.0),
        notes="Rock Solid Laser software STL pipeline.",
    ),
    # Green / DPSS lasers in the 532 nm family typically drive from DXF.
    "green_dxf": LaserPreset(
        name="Generic Green Laser (DXF)",
        vendor="Generic",
        default_format="dxf",
        crystal_size_xyz_mm=(40.0, 40.0, 60.0),
        notes="POINT entities in DXF.",
    ),
}


def apply_content_preset(base: CrystalParams, preset_key: str) -> CrystalParams:
    """Return a CrystalParams with the chosen content preset merged in.

    Non-tonemap / non-depth fields on `base` (like crystal size, seed) survive.
    """
    if preset_key not in CONTENT_PRESETS:
        raise KeyError(f"Unknown content preset: {preset_key}. "
                       f"Available: {list(CONTENT_PRESETS)}")
    p = CONTENT_PRESETS[preset_key]
    return replace(
        base,
        base_density=p.base_density,
        max_points_per_pixel=p.max_points_per_pixel,
        xy_jitter=p.xy_jitter,
        z_layers=p.z_layers,
        volumetric_thickness=p.volumetric_thickness,
        z_scale=p.z_scale,
        brightness=p.brightness,
        contrast=p.contrast,
        gamma=p.gamma,
        depth_gamma=p.depth_gamma,
    )


def apply_laser_preset(base: CrystalParams, preset_key: str) -> CrystalParams:
    """Override crystal size from a laser preset."""
    if preset_key not in LASER_PRESETS:
        raise KeyError(f"Unknown laser preset: {preset_key}. "
                       f"Available: {list(LASER_PRESETS)}")
    p = LASER_PRESETS[preset_key]
    x, y, z = p.crystal_size_xyz_mm
    return replace(base, size_x=x, size_y=y, size_z=z)
