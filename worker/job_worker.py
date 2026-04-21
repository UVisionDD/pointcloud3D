"""Polling job worker.

Loop: claim queued job from Postgres -> download input image from R2 ->
run pipeline -> upload outputs to R2 -> mark done.

Designed to run as a long-lived process on the Mac Mini via launchd / tmux.
"""
from __future__ import annotations

import json
import os
import signal
import socket
import tempfile
import time
import traceback
from pathlib import Path

from dataclasses import asdict

# Load .env sitting next to this file so `python job_worker.py` just works.
# Silently no-op if python-dotenv isn't installed or there's no .env.
try:
    from dotenv import load_dotenv  # type: ignore
    load_dotenv(Path(__file__).resolve().parent / ".env")
except Exception:
    pass

from pipeline import PipelineOptions, run_pipeline, load_depth_model
from pointcloud import CrystalParams
from presets import apply_content_preset, apply_laser_preset
from text_overlay import TextLine, TextOverlayParams
from storage import CONTENT_TYPES, download_to_path, upload_file
import db


POLL_INTERVAL_SECONDS = float(os.environ.get("WORKER_POLL_INTERVAL", "2.0"))
WORKER_ID = os.environ.get("WORKER_ID", socket.gethostname())
KEEP_RUNNING = True


def _signal_handler(signum, _frame):
    global KEEP_RUNNING
    print(f"Received signal {signum}, finishing current job then exiting.")
    KEEP_RUNNING = False


signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)


def options_from_job_row(job: dict, workdir: Path) -> PipelineOptions:
    """Build PipelineOptions from the Postgres `jobs` row.

    `job["options"]` is the jsonb column. It's expected to be a dict whose
    shape matches the web app's JobOptions type (see web/src/lib/jobs.ts).
    """
    opts_raw = job.get("options") or {}
    if isinstance(opts_raw, str):
        opts_raw = json.loads(opts_raw)

    crystal = CrystalParams(
        size_x=opts_raw.get("size_x", 50.0),
        size_y=opts_raw.get("size_y", 50.0),
        size_z=opts_raw.get("size_z", 80.0),
        margin_x=opts_raw.get("margin_x", 3.0),
        margin_y=opts_raw.get("margin_y", 3.0),
        margin_z=opts_raw.get("margin_z", 3.0),
        base_density=opts_raw.get("base_density", 0.35),
        max_points_per_pixel=opts_raw.get("max_points_per_pixel", 4),
        xy_jitter=opts_raw.get("xy_jitter", 0.5),
        z_layers=opts_raw.get("z_layers", 3),
        volumetric_thickness=opts_raw.get("volumetric_thickness", 0.08),
        z_scale=opts_raw.get("z_scale", 0.85),
        brightness=opts_raw.get("brightness", 0.0),
        contrast=opts_raw.get("contrast", 1.0),
        gamma=opts_raw.get("gamma", 1.0),
        invert_depth=opts_raw.get("invert_depth", True),
        depth_gamma=opts_raw.get("depth_gamma", 1.0),
        seed=opts_raw.get("seed", 42),
    )
    if opts_raw.get("content_preset"):
        crystal = apply_content_preset(crystal, opts_raw["content_preset"])
    if opts_raw.get("laser_preset"):
        crystal = apply_laser_preset(crystal, opts_raw["laser_preset"])

    text_overlay = None
    text_lines = opts_raw.get("text_lines") or []
    if text_lines:
        text_overlay = TextOverlayParams(
            lines=[
                TextLine(
                    text=ln["text"],
                    font_path=ln.get("font_path"),
                    font_size_px=ln.get("font_size_px", 64),
                )
                for ln in text_lines[:3]
            ],
            center_x_mm=opts_raw.get("text_center_x_mm", crystal.size_x / 2),
            center_y_mm=opts_raw.get("text_center_y_mm", 10.0),
            z_mm=opts_raw.get("text_z_mm", 20.0),
            block_width_mm=opts_raw.get("text_block_width_mm",
                                        crystal.size_x - 2 * crystal.margin_x - 10),
            z_layers=opts_raw.get("text_z_layers", 2),
            z_thickness_mm=opts_raw.get("text_z_thickness_mm", 1.5),
            seed=opts_raw.get("seed", 42),
        )

    return PipelineOptions(
        image_path=None,  # caller will set
        output_dir=workdir,
        output_stem="result",
        formats=tuple(opts_raw.get("formats", ("ply", "stl", "glb"))),
        remove_bg=bool(opts_raw.get("remove_bg", False)),
        face_aware=bool(opts_raw.get("face_aware", True)),
        face_strength=float(opts_raw.get("face_strength", 0.8)),
        crystal=crystal,
        text_overlay=text_overlay,
        point_size_mm=float(opts_raw.get("point_size_mm", 0.08)),
    )


def process_job(job: dict) -> None:
    job_id = job["id"]
    user_id = job["user_id"]
    input_key = job["input_key"]
    ext = Path(input_key).suffix.lstrip(".").lower() or "jpg"

    with tempfile.TemporaryDirectory(prefix=f"job-{job_id}-") as td:
        workdir = Path(td)
        src = workdir / f"input.{ext}"
        download_to_path(input_key, src)

        db.set_progress(job_id, 0.1)
        opts = options_from_job_row(job, workdir)
        opts.image_path = src

        result = run_pipeline(opts)
        db.set_progress(job_id, 0.8)

        # Upload each export under exports/{user_id}/{job_id}/result.{fmt}
        result_keys: dict[str, str] = {}
        for fmt, path in result.outputs.items():
            key = f"exports/{user_id}/{job_id}/result.{fmt}"
            upload_file(key, path, CONTENT_TYPES.get(fmt, "application/octet-stream"))
            result_keys[fmt] = key

        db.mark_done(job_id, result_keys, result.timings_ms)


def main() -> None:
    print(f"[worker {WORKER_ID}] warming up depth model...")
    load_depth_model()  # pre-load once so the first job isn't slow.
    print(f"[worker {WORKER_ID}] polling every {POLL_INTERVAL_SECONDS}s")

    while KEEP_RUNNING:
        try:
            job = db.claim_next_job(WORKER_ID)
        except Exception as e:
            print(f"[worker] DB error: {e}")
            time.sleep(POLL_INTERVAL_SECONDS * 3)
            continue

        if not job:
            time.sleep(POLL_INTERVAL_SECONDS)
            continue

        print(f"[worker] claimed job {job['id']}")
        try:
            process_job(job)
            print(f"[worker] job {job['id']} done")
        except Exception as e:
            print(f"[worker] job {job['id']} FAILED: {e}")
            traceback.print_exc()
            db.mark_failed(job["id"], f"{type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
