"""CLI wrapper around the pipeline.

Example:
    python generate.py photo.jpg --content-preset portrait --laser-preset xtool_f1_ultra
    python generate.py photo.jpg --remove-bg --no-face-aware --formats ply,glb
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

from pipeline import PipelineOptions, run_pipeline
from pointcloud import CrystalParams
from presets import apply_content_preset, apply_laser_preset, CONTENT_PRESETS, LASER_PRESETS
from text_overlay import TextLine, TextOverlayParams


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("image", type=Path)
    p.add_argument("--formats", type=str, default="ply,stl,glb,xyz,dxf")
    p.add_argument("--output-dir", type=Path, default=Path(__file__).parent / "output")
    p.add_argument("--output-stem", type=str, default=None)

    p.add_argument("--content-preset", choices=list(CONTENT_PRESETS), default=None)
    p.add_argument("--laser-preset", choices=list(LASER_PRESETS), default=None)

    # Geometry.
    p.add_argument("--size-xyz", nargs=3, type=float, default=[50.0, 50.0, 80.0])
    p.add_argument("--margin-xyz", nargs=3, type=float, default=[3.0, 3.0, 3.0])

    # Distribution.
    p.add_argument("--base-density", type=float, default=0.08)
    p.add_argument("--max-points-per-pixel", type=int, default=15)
    p.add_argument("--xy-jitter", type=float, default=0.5)
    p.add_argument("--z-layers", type=int, default=3)
    p.add_argument("--volumetric-thickness", type=float, default=0.08)
    p.add_argument("--z-scale", type=float, default=0.85)

    # Tonemap.
    p.add_argument("--brightness", type=float, default=0.0)
    p.add_argument("--contrast", type=float, default=1.0)
    p.add_argument("--gamma", type=float, default=1.0)

    # Depth curve.
    p.add_argument("--no-invert-depth", action="store_true")
    p.add_argument("--depth-gamma", type=float, default=1.0)

    # Stages.
    p.add_argument("--remove-bg", action="store_true")
    p.add_argument("--no-face-aware", action="store_true")
    p.add_argument("--face-strength", type=float, default=0.8)

    # STL.
    p.add_argument("--point-size-mm", type=float, default=0.08)

    # Text overlay (up to 3 lines; comma separated).
    p.add_argument("--text-lines", type=str, default=None,
                   help="Up to 3 text lines separated by ||, e.g. 'Happy Birthday||Emma||2026'")
    p.add_argument("--text-font", type=str, default=None)
    p.add_argument("--text-font-size", type=int, default=64)
    p.add_argument("--text-z-mm", type=float, default=20.0)
    p.add_argument("--text-block-width-mm", type=float, default=40.0)
    p.add_argument("--text-center-xy-mm", nargs=2, type=float, default=[25.0, 10.0])

    p.add_argument("--seed", type=int, default=42)
    return p


def main() -> None:
    args = build_parser().parse_args()
    if not args.image.exists():
        raise SystemExit(f"Input image not found: {args.image}")

    crystal = CrystalParams(
        size_x=args.size_xyz[0],
        size_y=args.size_xyz[1],
        size_z=args.size_xyz[2],
        margin_x=args.margin_xyz[0],
        margin_y=args.margin_xyz[1],
        margin_z=args.margin_xyz[2],
        base_density=args.base_density,
        max_points_per_pixel=args.max_points_per_pixel,
        xy_jitter=args.xy_jitter,
        z_layers=args.z_layers,
        volumetric_thickness=args.volumetric_thickness,
        z_scale=args.z_scale,
        brightness=args.brightness,
        contrast=args.contrast,
        gamma=args.gamma,
        invert_depth=not args.no_invert_depth,
        depth_gamma=args.depth_gamma,
        seed=args.seed,
    )

    if args.content_preset:
        crystal = apply_content_preset(crystal, args.content_preset)
    if args.laser_preset:
        crystal = apply_laser_preset(crystal, args.laser_preset)

    text_overlay = None
    if args.text_lines:
        raw = [s for s in args.text_lines.split("||") if s.strip()][:3]
        text_overlay = TextOverlayParams(
            lines=[TextLine(text=s, font_path=args.text_font,
                            font_size_px=args.text_font_size) for s in raw],
            z_mm=args.text_z_mm,
            block_width_mm=args.text_block_width_mm,
            center_x_mm=args.text_center_xy_mm[0],
            center_y_mm=args.text_center_xy_mm[1],
            seed=args.seed,
        )

    opts = PipelineOptions(
        image_path=args.image,
        output_dir=args.output_dir,
        output_stem=args.output_stem or args.image.stem,
        formats=tuple(f.strip().lower() for f in args.formats.split(",") if f.strip()),
        remove_bg=args.remove_bg,
        face_aware=not args.no_face_aware,
        face_strength=args.face_strength,
        crystal=crystal,
        text_overlay=text_overlay,
        point_size_mm=args.point_size_mm,
    )

    t0 = time.perf_counter()
    result = run_pipeline(opts)
    total = time.perf_counter() - t0

    print(f"Points: {result.points.shape[0]:,}")
    for k, v in result.timings_ms.items():
        print(f"  {k:22s} {v:8.1f} ms")
    print(f"Total:  {total:.2f}s")
    for fmt, path in result.outputs.items():
        size_mb = path.stat().st_size / (1024 * 1024)
        print(f"  {fmt.upper():4s} {path}  ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
