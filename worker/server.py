"""Minimal FastAPI server for the Mac Mini worker.

Two endpoints:
    GET  /health            -- is the model loaded, what device, basic info.
    POST /process           -- direct HTTP processing (dev/testing, bypasses
                               the Postgres queue). Body is multipart with
                               `image` file + JSON `options`.

The primary production path is the Postgres polling loop in `job_worker.py`.
This server is for a secret health check and for curl-based manual tests.
"""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from pipeline import MODEL_ID, PipelineOptions, load_depth_model, pick_device, run_pipeline
from pointcloud import CrystalParams
from presets import apply_content_preset, apply_laser_preset


app = FastAPI(title="pointcloud3D worker", version="0.1.0")


@app.on_event("startup")
def _warmup() -> None:
    load_depth_model()


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "device": str(pick_device()),
        # Report whichever DAv2 variant pipeline.py is actually loading so
        # the health endpoint doesn't lie after a model swap.
        "model": MODEL_ID,
        "worker_id": os.environ.get("WORKER_ID", "local"),
    }


def _opts_from_json(raw: dict[str, Any], workdir: Path) -> PipelineOptions:
    crystal = CrystalParams(**{
        k: raw[k] for k in (
            "size_x", "size_y", "size_z",
            "margin_x", "margin_y", "margin_z",
            "base_density", "max_points_per_pixel",
            "xy_jitter", "layer_height_mm", "z_layers",
            "volumetric_thickness", "z_scale",
            "brightness", "contrast", "gamma",
            "invert_depth", "depth_gamma", "seed",
        ) if k in raw
    })
    if raw.get("content_preset"):
        crystal = apply_content_preset(crystal, raw["content_preset"])
    if raw.get("laser_preset"):
        crystal = apply_laser_preset(crystal, raw["laser_preset"])

    return PipelineOptions(
        output_dir=workdir,
        output_stem=raw.get("output_stem", "result"),
        formats=tuple(raw.get("formats", ("ply", "stl", "glb"))),
        remove_bg=bool(raw.get("remove_bg", False)),
        face_aware=bool(raw.get("face_aware", True)),
        face_strength=float(raw.get("face_strength", 0.8)),
        crystal=crystal,
        point_size_mm=float(raw.get("point_size_mm", 0.08)),
        rotation=int(raw.get("rotation", 0) or 0),
    )


@app.post("/process")
async def process(
    image: UploadFile = File(...),
    options: str = Form("{}"),
) -> JSONResponse:
    try:
        opts_raw = json.loads(options) if options else {}
    except json.JSONDecodeError:
        raise HTTPException(400, "options must be valid JSON")

    with tempfile.TemporaryDirectory(prefix="process-") as td:
        workdir = Path(td)
        ext = Path(image.filename or "input.jpg").suffix.lstrip(".").lower() or "jpg"
        src = workdir / f"input.{ext}"
        src.write_bytes(await image.read())

        opts = _opts_from_json(opts_raw, workdir)
        opts.image_path = src
        result = run_pipeline(opts)

        return JSONResponse({
            "points": int(result.points.shape[0]),
            "timings_ms": result.timings_ms,
            "files": {fmt: str(path) for fmt, path in result.outputs.items()},
        })
