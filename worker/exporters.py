"""Write point clouds to STL / GLB / DXF / PLY / XYZ.

STL / GLB for crystal-engraving laser software (RK-CAD, BSL, xTool) typically
want points rendered as degenerate tiny tetrahedra (four-triangle hulls around
each point) because the format is triangle-based. That is what we do here.

DXF: exported as POINT entities (what green-laser DXF-based pipelines expect).
PLY / XYZ: native point-cloud formats.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import trimesh


def write_xyz(points: np.ndarray, path: Path) -> None:
    """Plain text: x y z per line, millimetres."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savetxt(path, points, fmt="%.4f", delimiter=" ")


def write_ply(points: np.ndarray, path: Path) -> None:
    """Binary PLY point cloud."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    cloud = trimesh.points.PointCloud(points)
    cloud.export(path)


def _points_to_tetrahedra(points: np.ndarray, size_mm: float) -> trimesh.Trimesh:
    """Convert N points into a mesh of N tiny tetrahedra centered on each point.

    size_mm is the radius of each tet in millimetres. For laser engraving,
    this is effectively the "point size" knob.
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

    # (N, 4, 3) vertices and (N, 4, 3) face indices.
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
    """Binary STL of tiny tetrahedra, one per point."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    mesh = _points_to_tetrahedra(points, point_size_mm)
    mesh.export(path, file_type="stl")


def write_glb(points: np.ndarray, path: Path) -> None:
    """Binary glTF (.glb) with a single POINTS primitive.

    glTF supports point primitives natively, so this is lightweight and the
    xTool / browser viewers handle it well.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    cloud = trimesh.points.PointCloud(points)
    scene = trimesh.Scene(cloud)
    scene.export(path, file_type="glb")


def write_dxf(points: np.ndarray, path: Path) -> None:
    """DXF with POINT entities. Green-laser DXF pipelines consume these."""
    import ezdxf

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = ezdxf.new(dxfversion="R2010")
    msp = doc.modelspace()
    for x, y, z in points:
        msp.add_point((float(x), float(y), float(z)))
    doc.saveas(path)


EXPORTERS = {
    "xyz": write_xyz,
    "ply": write_ply,
    "stl": write_stl,
    "glb": write_glb,
    "dxf": write_dxf,
}
