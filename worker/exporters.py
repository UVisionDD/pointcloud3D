"""Write point clouds to STL / GLB / DXF / PLY / XYZ.

STL / GLB for crystal-engraving laser software (RK-CAD, BSL, xTool) typically
want points rendered as degenerate tiny tetrahedra (four-triangle hulls around
each point) because the format is triangle-based. That is what we do here.

DXF: exported as POINT entities (what green-laser DXF-based pipelines expect).
PLY / XYZ: native point-cloud formats.

All exporters accept either an (N, 3) or (N, 4) float32 array. When the 4th
column is present it's treated as a 0..1 intensity scalar: we fold it into
per-vertex RGB for PLY/GLB (so browsers can shade), into a 4th scalar column
for XYZ (so downstream CAM tools can read it), and into per-point tetrahedron
size for STL (brighter points => slightly larger crystal spots).
"""
from __future__ import annotations

import struct
from pathlib import Path

import numpy as np
import trimesh


def _split_xyz_intensity(points: np.ndarray) -> tuple[np.ndarray, np.ndarray | None]:
    """Return (xyz(N,3) float32, intensity(N,) float32 in 0..1 or None)."""
    if points.ndim != 2 or points.shape[0] == 0:
        return np.zeros((0, 3), dtype=np.float32), None
    xyz = points[:, :3].astype(np.float32, copy=False)
    if points.shape[1] >= 4:
        inten = np.clip(points[:, 3].astype(np.float32, copy=False), 0.0, 1.0)
        return xyz, inten
    return xyz, None


def write_xyz(points: np.ndarray, path: Path) -> None:
    """Plain text: `x y z [intensity]` per line, millimetres. Intensity is
    written as 0..1 when available so CAM tools can use it; tools that
    only read the first three columns ignore it cleanly."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    xyz, inten = _split_xyz_intensity(points)
    if inten is None:
        np.savetxt(path, xyz, fmt="%.4f", delimiter=" ")
    else:
        arr = np.concatenate([xyz, inten[:, None]], axis=1)
        np.savetxt(path, arr, fmt=("%.4f", "%.4f", "%.4f", "%.4f"), delimiter=" ")


def write_ply(points: np.ndarray, path: Path) -> None:
    """Binary little-endian PLY point cloud.

    We write it by hand so we can emit per-vertex RGB derived from intensity
    *and* keep a `scalar_intensity` float property for downstream CAM tools.
    three.js' PLYLoader reads the `red/green/blue` properties as vertex
    colors, so the in-browser viewer lights up the portrait without any
    extra shader work.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    xyz, inten = _split_xyz_intensity(points)
    n = xyz.shape[0]

    if inten is None:
        inten = np.full((n,), 0.85, dtype=np.float32)

    # Map intensity 0..1 -> uchar 0..255 for RGB. Using a cool-white crystal
    # tint rather than pure grayscale keeps the preview readable even on
    # very dark backgrounds. CAM tools that only want the scalar read the
    # `scalar_intensity` property instead.
    level = np.clip(inten, 0.0, 1.0)
    # Slight cool tint: R slightly lower than G/B so highlights look crystalline.
    r8 = (level * 232).astype(np.uint8)
    g8 = (level * 241).astype(np.uint8)
    b8 = (level * 255).astype(np.uint8)

    header = (
        "ply\n"
        "format binary_little_endian 1.0\n"
        f"element vertex {n}\n"
        "property float x\n"
        "property float y\n"
        "property float z\n"
        "property uchar red\n"
        "property uchar green\n"
        "property uchar blue\n"
        "property float scalar_intensity\n"
        "end_header\n"
    ).encode("ascii")

    # Pack each vertex tightly: 3 × float32 (xyz) + 3 × uint8 (rgb) +
    # 1 × float32 (intensity) = 19 bytes. np.dtype with no `align` kwarg
    # matches PLY's packed-byte convention exactly.
    dtype = np.dtype([
        ("x", "<f4"), ("y", "<f4"), ("z", "<f4"),
        ("r", "u1"), ("g", "u1"), ("b", "u1"),
        ("i", "<f4"),
    ])
    rec = np.empty(n, dtype=dtype)
    rec["x"] = xyz[:, 0]
    rec["y"] = xyz[:, 1]
    rec["z"] = xyz[:, 2]
    rec["r"] = r8
    rec["g"] = g8
    rec["b"] = b8
    rec["i"] = level

    with open(path, "wb") as f:
        f.write(header)
        f.write(rec.tobytes())


def _points_to_tetrahedra(
    points: np.ndarray,
    size_mm: float,
    intensity: np.ndarray | None = None,
) -> trimesh.Trimesh:
    """Convert N points into a mesh of N tiny tetrahedra centered on each point.

    size_mm is the *base* radius in millimetres. When `intensity` is provided
    each tet is scaled by (0.5 + 0.5 * intensity) so bright points burn as
    slightly larger specks — a cheap way to encode laser-power modulation
    into triangle-only formats like STL.
    """
    n = points.shape[0]
    # Unit tetrahedron vertices centered at origin.
    tet = np.array(
        [
            [1.0, 1.0, 1.0],
            [1.0, -1.0, -1.0],
            [-1.0, 1.0, -1.0],
            [-1.0, -1.0, 1.0],
        ],
        dtype=np.float32,
    )
    tet = tet * size_mm

    if intensity is not None:
        # Per-point scale in [0.5, 1.0]. Shape (N, 1, 1) for broadcast.
        scale = (0.5 + 0.5 * np.clip(intensity, 0.0, 1.0)).astype(np.float32)
        scaled_tet = tet[None, :, :] * scale[:, None, None]
        verts = points[:, None, :] + scaled_tet
    else:
        verts = points[:, None, :] + tet[None, :, :]
    verts = verts.reshape(-1, 3)

    base_faces = np.array(
        [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]],
        dtype=np.int64,
    )
    offsets = (np.arange(n, dtype=np.int64) * 4)[:, None, None]
    faces = base_faces[None, :, :] + offsets
    faces = faces.reshape(-1, 3)

    return trimesh.Trimesh(vertices=verts, faces=faces, process=False)


def write_stl(points: np.ndarray, path: Path, point_size_mm: float = 0.08) -> None:
    """Binary STL of tiny tetrahedra, one per point. Tet size is modulated by
    per-point intensity when present so bright pixels burn bigger."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    xyz, inten = _split_xyz_intensity(points)
    mesh = _points_to_tetrahedra(xyz, point_size_mm, inten)
    mesh.export(path, file_type="stl")


def write_glb(points: np.ndarray, path: Path) -> None:
    """Binary glTF (.glb) with a single POINTS primitive.

    glTF supports point primitives natively, so this is lightweight and the
    xTool / browser viewers handle it well. When intensity is available we
    attach it as per-vertex RGB so the browser viewer shades the portrait.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    xyz, inten = _split_xyz_intensity(points)

    if inten is not None:
        level = np.clip(inten, 0.0, 1.0)
        colors = np.stack(
            [level * 232, level * 241, level * 255, np.full_like(level, 255)],
            axis=1,
        ).astype(np.uint8)
        cloud = trimesh.points.PointCloud(xyz, colors=colors)
    else:
        cloud = trimesh.points.PointCloud(xyz)
    scene = trimesh.Scene(cloud)
    scene.export(path, file_type="glb")


def write_dxf(points: np.ndarray, path: Path) -> None:
    """DXF with POINT entities. Green-laser DXF-based pipelines consume these.

    DXF's POINT entity doesn't natively carry intensity, so we write a plain
    XYZ point cloud here. Intensity-aware engravers should prefer PLY/XYZ.
    """
    import ezdxf

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    xyz, _ = _split_xyz_intensity(points)
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()
    for x, y, z in xyz:
        msp.add_point((float(x), float(y), float(z)))
    doc.saveas(path)


# Silence a false "struct unused" warning without removing the import — we
# reserve it for a future custom binary format.
_ = struct


EXPORTERS = {
    "xyz": write_xyz,
    "ply": write_ply,
    "stl": write_stl,
    "glb": write_glb,
    "dxf": write_dxf,
}
