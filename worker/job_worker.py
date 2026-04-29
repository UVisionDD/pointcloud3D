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

    # Apply BOTH presets FIRST to seed sensible defaults, THEN let explicit
    # client fields override. Ordering matters:
    #   1. Empty CrystalParams — hardcoded dataclass defaults.
    #   2. content_preset (portrait/pet/etc.) — overrides tonemap + z curves.
    #   3. laser_preset (xtool/haotian/etc.) — overrides crystal size.
    #   4. Client fields — win against everything else via pick() below.
    # Without step 4 winning, the density/depth sliders and the crystal
    # dimension inputs in the UI would silently be clobbered by the presets.
    crystal = CrystalParams()
    if opts_raw.get("content_preset"):
        crystal = apply_content_preset(crystal, opts_raw["content_preset"])
    if opts_raw.get("laser_preset"):
        crystal = apply_laser_preset(crystal, opts_raw["laser_preset"])

    def pick(k: str, fallback):
        v = opts_raw.get(k)
        return fallback if v is None else v

    from dataclasses import replace as _replace
    crystal = _replace(
        crystal,
        size_x=pick("size_x", crystal.size_x),
        size_y=pick("size_y", crystal.size_y),
        size_z=pick("size_z", crystal.size_z),
        margin_x=pick("margin_x", crystal.margin_x),
        margin_y=pick("margin_y", crystal.margin_y),
        margin_z=pick("margin_z", crystal.margin_z),
        base_density=pick("base_density", crystal.base_density),
        max_points_per_pixel=pick("max_points_per_pixel", crystal.max_points_per_pixel),
        xy_jitter=pick("xy_jitter", crystal.xy_jitter),
        z_layers=pick("z_layers", crystal.z_layers),
        sampling_max_side_px=pick("sampling_max_side_px", crystal.sampling_max_side_px),
        volumetric_thickness=pick("volumetric_thickness", crystal.volumetric_thickness),
        z_scale=pick("z_scale", crystal.z_scale),
        brightness=pick("brightness", crystal.brightness),
        contrast=pick("contrast", crystal.contrast),
        gamma=pick("gamma", crystal.gamma),
        invert_depth=pick("invert_depth", crystal.invert_depth),
        depth_gamma=pick("depth_gamma", crystal.depth_gamma),
        intensity_gamma=pick("intensity_gamma", crystal.intensity_gamma),
        intensity_floor=pick("intensity_floor", crystal.intensity_floor),
        layer_falloff=pick("layer_falloff", crystal.layer_falloff),
        target_points=pick("target_points", crystal.target_points),
        layer_height_mm=pick("layer_height_mm", crystal.layer_height_mm),
        seed=pick("seed", crystal.seed),
    )

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

    # BG-preview fast-path: the web UI fires a throwaway job with
    # preview_only=True when the user toggles "Remove background" so they can
    # see the matte before committing to a full cloud generation. Skip depth,
    # sampling, and exports entirely — just run bg-removal and upload a PNG.
    if bool(opts_raw.get("preview_only")):
        with tempfile.TemporaryDirectory(prefix=f"preview-{job_id}-") as td:
            workdir = Path(td)
            src = workdir / f"input.{ext}"
            download_to_path(input_key, src)

            db.set_progress(job_id, 0.3)

            import numpy as np  # local import — keeps startup lean
            from PIL import Image

            img = Image.open(src).convert("RGB")
            img_arr = np.array(img)

            if bool(opts_raw.get("remove_bg", True)):
                from bg_remove import remove_background
                result_arr, _alpha = remove_background(img_arr)
            else:
                result_arr = img_arr

            db.set_progress(job_id, 0.8)

            # Downscale to max 1400px on the longest side — the UI only needs
            # a preview, and smaller PNGs round-trip faster through R2.
            max_side = 1400
            h, w = result_arr.shape[:2]
            if max(h, w) > max_side:
                scale = max_side / max(h, w)
                pil = Image.fromarray(result_arr).resize(
                    (int(w * scale), int(h * scale)), Image.LANCZOS
                )
                result_arr = np.array(pil)

            out = workdir / "bg_preview.png"
            Image.fromarray(result_arr).save(out, format="PNG", optimize=True)

            key = f"exports/{user_id}/{job_id}/bg_preview.png"
            upload_file(key, out, "image/png")
            db.mark_done(job_id, {"bg_preview": key}, {"preview_only": 1})
            return

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
