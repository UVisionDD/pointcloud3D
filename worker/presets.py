"""Preset library for subject type (Portrait/Pet/etc.) and laser vendor.

All numbers here are first-pass defaults intended to be tuned against real
crystal test samples. Keep them in one place so the web UI and the worker
agree on what "Portrait + xTool F1 Ultra" actually means.
"""
from __future__ import annotations

from dataclasses import dataclass, replace

from pointcloud import CrystalParams


# ---------- Content presets (subject type) ----------

# Each subject type picks its own base_density so the total count is
# tuned for that content (text/logo wants more density on sparse strokes,
# landscape benefits from sky/horizon coverage, etc.). Total count emerges
# from pixels × mean(tonemapped luminance) × base_density × max_points_per_pixel
# × falloff_avg, so brightness/contrast/gamma sliders move the needle on
# top of the preset baseline. Typical 4 MP photo lands at 750k–1.5M points
# under default tonemap.
CONTENT_PRESETS: dict[str, CrystalParams] = {
    # Faces benefit from finer vertical resolution (smoother forehead/cheek
    # gradients), so portraits run a tighter layer height. Shallow Z keeps
    # the nose from poking into the upper half of the crystal.
    "portrait": CrystalParams(
        base_density=0.09,
        max_points_per_pixel=15,
        xy_jitter=0.5,
        layer_height_mm=0.10,
        volumetric_thickness=0.05,
        z_scale=0.22,
        contrast=1.15,
        gamma=0.95,
        depth_gamma=0.85,
    ),
    # Pets are furrier — bump jitter a hair so fur doesn't look banded.
    "pet": CrystalParams(
        base_density=0.10,
        max_points_per_pixel=15,
        xy_jitter=0.55,
        layer_height_mm=0.12,
        volumetric_thickness=0.07,
        z_scale=0.28,
        contrast=1.1,
        gamma=1.0,
        depth_gamma=0.9,
    ),
    # Landscapes want more Z spread — horizon depth is the whole selling point.
    # Slightly coarser layer height since the crystal slab is larger anyway.
    "landscape": CrystalParams(
        base_density=0.11,
        max_points_per_pixel=15,
        xy_jitter=0.5,
        layer_height_mm=0.18,
        volumetric_thickness=0.10,
        z_scale=0.55,
        contrast=1.05,
        gamma=1.0,
        depth_gamma=1.0,
    ),
    # Objects usually have dark background, effective lum lower — compensate
    # by nudging base_density up.
    "object": CrystalParams(
        base_density=0.10,
        max_points_per_pixel=15,
        xy_jitter=0.5,
        layer_height_mm=0.15,
        volumetric_thickness=0.07,
        z_scale=0.3,
        contrast=1.1,
        gamma=1.0,
        depth_gamma=0.95,
    ),
    # Text/logo is mostly dark pixels w/ dense bright strokes; tighten Z hard
    # and use a smallish layer height for crisp letterforms.
    "text_logo": CrystalParams(
        base_density=0.13,
        max_points_per_pixel=15,
        xy_jitter=0.3,
        layer_height_mm=0.10,
        volumetric_thickness=0.03,
        z_scale=0.18,
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
        layer_height_mm=p.layer_height_mm,
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
