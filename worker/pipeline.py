"""Unified photo -> point cloud pipeline.

Callable from both the CLI (`generate.py`) and the FastAPI worker server.
Holds all the optional stages (bg removal, face-aware depth, text overlay)
behind flags so the caller picks what they want.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import torch
from PIL import Image

from pointcloud import CrystalParams, generate_points
from text_overlay import TextOverlayParams, generate_text_points

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"

_PROCESSOR = None
_MODEL = None


def pick_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def load_depth_model(device: torch.device | None = None):
    """Load (and cache) the DAv2 Small processor + model on the chosen device."""
    global _PROCESSOR, _MODEL
    from transformers import AutoImageProcessor, AutoModelForDepthEstimation

    device = device or pick_device()
    if _PROCESSOR is None or _MODEL is None:
        _PROCESSOR = AutoImageProcessor.from_pretrained(MODEL_ID)
        _MODEL = AutoModelForDepthEstimation.from_pretrained(MODEL_ID).to(device).eval()
    return _PROCESSOR, _MODEL, device


@dataclass
class PipelineOptions:
    # Source.
    image_path: Path | None = None        # or provide `image` directly.
    image: Image.Image | None = None
    output_dir: Path = Path("output")
    output_stem: str = "result"
    formats: tuple[str, ...] = ("ply", "stl", "glb", "xyz", "dxf")

    # Stages.
    remove_bg: bool = False
    face_aware: bool = True
    face_pad_frac: float = 0.25
    face_feather_px: int = 24
    face_strength: float = 0.8

    # Crystal + distribution params.
    crystal: CrystalParams = field(default_factory=CrystalParams)

    # Text overlay (optional).
    text_overlay: TextOverlayParams | None = None

    # STL point size.
    point_size_mm: float = 0.08


@dataclass
class PipelineResult:
    points: np.ndarray
    depth: np.ndarray                     # final depth map (post face enhancement)
    outputs: dict[str, Path]              # {"ply": Path(...), ...}
    timings_ms: dict[str, float]


def run_pipeline(opts: PipelineOptions) -> PipelineResult:
    from exporters import EXPORTERS

    timings: dict[str, float] = {}

    # --- Load source image ---
    if opts.image is not None:
        image = opts.image.convert("RGB")
    elif opts.image_path is not None:
        image = Image.open(opts.image_path).convert("RGB")
    else:
        raise ValueError("Must provide image or image_path in PipelineOptions.")
    image_rgb = np.asarray(image)

    # --- Optional background removal (must happen before depth) ---
    if opts.remove_bg:
        from bg_remove import remove_background

        t0 = time.perf_counter()
        image_rgb, _alpha = remove_background(image_rgb)
        image = Image.fromarray(image_rgb)
        timings["bg_remove_ms"] = (time.perf_counter() - t0) * 1000

    # --- Depth estimation ---
    processor, model, device = load_depth_model()
    inputs = processor(images=image, return_tensors="pt").to(device)

    # Warmup first call on MPS (kernels compile).
    with torch.no_grad():
        _ = model(**inputs)
    if device.type == "mps":
        torch.mps.synchronize()

    t0 = time.perf_counter()
    with torch.no_grad():
        outputs = model(**inputs)
    if device.type == "mps":
        torch.mps.synchronize()
    timings["depth_ms"] = (time.perf_counter() - t0) * 1000

    depth = torch.nn.functional.interpolate(
        outputs.predicted_depth.unsqueeze(1),
        size=image.size[::-1],  # (H, W)
        mode="bicubic",
        align_corners=False,
    ).squeeze().cpu().numpy().astype(np.float32)

    # --- Optional face-aware enhancement ---
    if opts.face_aware:
        try:
            from face_depth import enhance_depth_on_faces

            t0 = time.perf_counter()
            depth = enhance_depth_on_faces(
                image_rgb,
                depth,
                processor,
                model,
                device,
                pad_frac=opts.face_pad_frac,
                feather_px=opts.face_feather_px,
                strength=opts.face_strength,
            )
            timings["face_depth_ms"] = (time.perf_counter() - t0) * 1000
        except RuntimeError:
            # MediaPipe not installed — skip silently.
            timings["face_depth_ms"] = 0.0

    # --- Point cloud ---
    t0 = time.perf_counter()
    points = generate_points(image_rgb, depth, opts.crystal)
    timings["points_ms"] = (time.perf_counter() - t0) * 1000

    # --- Text overlay points (appended) ---
    if opts.text_overlay and opts.text_overlay.lines:
        text_pts = generate_text_points(opts.text_overlay)
        if text_pts.size:
            points = np.concatenate([points, text_pts], axis=0)

    # --- Exports ---
    out_dir = Path(opts.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    output_files: dict[str, Path] = {}
    for fmt in opts.formats:
        if fmt not in EXPORTERS:
            raise ValueError(f"Unknown format: {fmt}. Valid: {list(EXPORTERS)}")
        path = out_dir / f"{opts.output_stem}.{fmt}"
        t0 = time.perf_counter()
        if fmt == "stl":
            EXPORTERS[fmt](points, path, point_size_mm=opts.point_size_mm)
        else:
            EXPORTERS[fmt](points, path)
        timings[f"export_{fmt}_ms"] = (time.perf_counter() - t0) * 1000
        output_files[fmt] = path

    return PipelineResult(
        points=points,
        depth=depth,
        outputs=output_files,
        timings_ms=timings,
    )
