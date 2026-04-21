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

    # Fallbacks here match the CrystalParams dataclass defaults so a job
    # row that omits a field doesn't accidentally downgrade to old values.
    crystal = CrystalParams(
        size_x=opts_raw.get("size_x", 50.0),
        size_y=opts_raw.get("size_y", 50.0),
        size_z=opts_raw.get("size_z", 80.0),
        margin_x=opts_raw.get("margin_x", 3.0),
        margin_y=opts_raw.get("margin_y", 3.0),
        margin_z=opts_raw.get("margin_z", 3.0),
        base_density=opts_raw.get("base_density", 0.8),
        max_points_per_pixel=opts_raw.get("max_points_per_pixel", 10),
        xy_jitter=opts_raw.get("xy_jitter", 0.5),
        z_layers=opts_raw.get("z_layers", 5),
        sampling_max_side_px=opts_raw.get("sampling_max_side_px", 2000),
        volumetric_thickness=opts_raw.get("volumetric_thickness", 0.08),
        z_scale=opts_raw.get("z_scale", 0.45),
        brightness=opts_raw.get("brightness", 0.0),
        contrast=opts_raw.get("contrast", 1.0),
        gamma=opts_raw.get("gamma", 1.0),
        invert_depth=opts_raw.get("invert_depth", True),
        depth_gamma=opts_raw.get("depth_gamma", 1.0),
        intensity_gamma=opts_raw.get("intensity_gamma", 1.0),
        intensity_floor=opts_raw.get("intensity_floor", 0.12),
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

    opts_raw = job.get("options") or {}
    if isinstance(opts_raw, str):
        opts_raw = json.loads(opts_raw)

    with tempfile.TemporaryDirectory(prefix=f"job-{job_id}-") as td:
        workdir = Path(td)

        db.set_progress(job_id, 0.1)
        opts = options_from_job_row(job, workdir)

        # Retune fast path: if the job points at a parent job with cached
        # depth + image, download them and wire the pipeline to skip the
        # slow ML stages. This is what the live-slider UI depends on.
        reuse_parent = opts_raw.get("reuse_depth_from_job")
        if reuse_parent:
            cache_dir = workdir / "depth_cache"
            cache_dir.mkdir(parents=True, exist_ok=True)
            try:
                download_to_path(
                    f"exports/{user_id}/{reuse_parent}/depth.npy",
                    cache_dir / "depth.npy",
                )
                download_to_path(
                    f"exports/{user_id}/{reuse_parent}/image_rgb.npy",
                    cache_dir / "image_rgb.npy",
                )
                opts.reuse_depth_from_dir = cache_dir
                opts.image_path = None
                print(f"[worker] retune: reusing depth from job {reuse_parent}")
            except Exception as e:
                # If the cache is missing we can still fall back to a full
                # run by downloading the input image — just log and continue.
                print(f"[worker] retune cache miss ({e}); falling back to full inference")
                reuse_parent = None

        if not reuse_parent:
            src = workdir / f"input.{ext}"
            download_to_path(input_key, src)
            opts.image_path = src
            # Always cache depth + image for potential future retunes.
            opts.save_depth_to_dir = workdir / "depth_cache"

        result = run_pipeline(opts)
        db.set_progress(job_id, 0.8)

        # Upload each export under exports/{user_id}/{job_id}/result.{fmt}.
        # Always also upload a PLY so the in-browser viewer has something
        # to load, even if the user only asked for STL/DXF.
        result_keys: dict[str, str] = {}
        for fmt, path in result.outputs.items():
            key = f"exports/{user_id}/{job_id}/result.{fmt}"
            upload_file(key, path, CONTENT_TYPES.get(fmt, "application/octet-stream"))
            result_keys[fmt] = key

        # Upload the depth cache so children of this job can retune without
        # paying the ML cost again. Only do this on full runs — retunes
        # reuse the parent's cache, and uploading a copy per retune would
        # be wasteful.
        if not reuse_parent:
            cache_dir = workdir / "depth_cache"
            if (cache_dir / "depth.npy").exists():
                upload_file(
                    f"exports/{user_id}/{job_id}/depth.npy",
                    cache_dir / "depth.npy",
                    "application/octet-stream",
                )
                upload_file(
                    f"exports/{user_id}/{job_id}/image_rgb.npy",
                    cache_dir / "image_rgb.npy",
                    "application/octet-stream",
                )

        # Record the real point count on the job row so the UI can stop
        # guessing from the slider and show the true number.
        timings = dict(result.timings_ms)
        timings["points_count"] = int(result.points.shape[0])
        # Expose whether this job has a cacheable depth map — the web UI
        # uses this to enable retune on the parent job.
        timings["has_depth_cache"] = 1 if not reuse_parent else 0

        db.mark_done(job_id, result_keys, timings)


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
        except BaseException as e:  # noqa: BLE001 — intentional: catch SystemExit too
            # rembg etc. can raise SystemExit when a backend is missing, which
            # would otherwise take down the whole worker. Mark the job failed
            # so the web UI shows a useful error, then keep polling for the
            # next one. Only re-raise on SIGINT/SIGTERM (KeyboardInterrupt).
            print(f"[worker] job {job['id']} FAILED: {type(e).__name__}: {e}")
            traceback.print_exc()
            try:
                db.mark_failed(job["id"], f"{type(e).__name__}: {e}")
            except Exception as mark_err:
                print(f"[worker] could not mark job failed: {mark_err}")
            if isinstance(e, KeyboardInterrupt):
                raise


if __name__ == "__main__":
    main()
