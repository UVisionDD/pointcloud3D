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

# Depth-Anything-V2-Large: 335 M params, ~1.3 GB FP32. Needs MPS / CUDA;
# CPU inference takes tens of seconds. On an M4 Mac Mini (16 GB unified)
# first load pulls the weights from HF (~650 MB on disk) and runs in the
# ~1–3 s range per image. Swap to `-Base-hf` or `-Small-hf` if memory is
# tight or you want faster turnaround; swap to the `-Metric-*` variants
# if you want absolute depth in meters instead of relative.
MODEL_ID = "depth-anything/Depth-Anything-V2-Large-hf"

_PROCESSOR = None
_MODEL = None


def pick_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def load_depth_model(device: torch.device | None = None):
    """Load (and cache) the DAv2 Large processor + model on the chosen device."""
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

    # Source-image rotation in 90° steps (clockwise). The web UI shows the
    # rotation as a CSS transform on the source pane; the worker applies the
    # *same* rotation to the pixels here so the depth model and sampler see
    # the user-chosen orientation. Anything that's not a multiple of 90° is
    # snapped to the nearest one — the sampler assumes axis-aligned grids.
    rotation: int = 0

    # Fast-path: if `reuse_depth_from_dir` points at a directory containing
    # depth.npy + image_rgb.npy (saved by a prior run), skip bg removal, depth
    # inference, and face-aware enhancement. Only the sampling + export stages
    # run — turnaround drops from ~5s to ~500ms. This is what powers the
    # "live slider retune" UX.
    reuse_depth_from_dir: Path | None = None
    # If set, save depth.npy + image_rgb.npy to this dir after the slow stages
    # so a future retune job can skip straight to sampling.
    save_depth_to_dir: Path | None = None


@dataclass
class PipelineResult:
    points: np.ndarray
    depth: np.ndarray                     # final depth map (post face enhancement)
    outputs: dict[str, Path]              # {"ply": Path(...), ...}
    timings_ms: dict[str, float]


def run_pipeline(opts: PipelineOptions) -> PipelineResult:
    import json as _json

    from exporters import EXPORTERS

    timings: dict[str, float] = {}

    # Snap rotation to a multiple of 90° (clockwise). The UI only ever sends
    # 0/90/180/270 but defending against bad input is cheap.
    requested_rotation = int(round((opts.rotation or 0) / 90.0)) * 90 % 360

    # --- Fast path: reuse cached image_rgb + depth from an earlier job ---
    # The retune endpoint uses this. Everything up to (and including) depth
    # inference and face-aware enhancement is skipped — we jump straight to
    # the Bernoulli sampler, which is where the slider-controlled knobs live.
    if opts.reuse_depth_from_dir is not None:
        cache = Path(opts.reuse_depth_from_dir)
        image_path = cache / "image_rgb.npy"
        depth_path = cache / "depth.npy"
        meta_path = cache / "meta.json"
        if not image_path.exists() or not depth_path.exists():
            raise FileNotFoundError(
                f"reuse_depth_from_dir={cache} is missing image_rgb.npy or depth.npy"
            )
        t0 = time.perf_counter()
        image_rgb = np.load(image_path)
        depth = np.load(depth_path)
        # Cached arrays are stored at whatever rotation the parent ran with.
        # If the user has spun the dial since, rotate both arrays by the
        # delta — np.rot90 is essentially free (~1ms on a 2500px image) so
        # it's much cheaper than re-running the depth model just for a flip.
        cached_rotation = 0
        if meta_path.exists():
            try:
                meta = _json.loads(meta_path.read_text())
                cached_rotation = int(meta.get("rotation", 0)) % 360
            except Exception as e:  # malformed json, missing key, etc.
                print(f"[pipeline] cache meta.json unreadable ({e}); assuming rotation=0")
        delta_rotation = (requested_rotation - cached_rotation) % 360
        if delta_rotation != 0:
            # np.rot90(k) does k counter-clockwise turns. Our convention is
            # clockwise degrees, so a +90° clockwise rotation = k=-1.
            k = -(delta_rotation // 90)
            image_rgb = np.ascontiguousarray(np.rot90(image_rgb, k=k))
            depth = np.ascontiguousarray(np.rot90(depth, k=k))
            print(f"[pipeline] retune rotated cache by {delta_rotation}° "
                  f"(parent {cached_rotation}° → child {requested_rotation}°)")
        timings["depth_cache_load_ms"] = (time.perf_counter() - t0) * 1000
        print(f"[pipeline] loaded cached depth+image from {cache} "
              f"in {timings['depth_cache_load_ms']:.0f} ms "
              f"(image {image_rgb.shape}, depth {depth.shape})")
    else:
        # --- Load source image ---
        if opts.image is not None:
            image = opts.image.convert("RGB")
        elif opts.image_path is not None:
            image = Image.open(opts.image_path).convert("RGB")
        else:
            raise ValueError("Must provide image or image_path in PipelineOptions.")
        print(f"[pipeline] source image: {image.size[0]}x{image.size[1]}")

        # --- Apply user rotation BEFORE depth inference ---
        # Rotating after depth would smear the model's output across pixel
        # boundaries; the model is also approximately rotation-equivariant
        # for relative depth, so doing it here keeps the cloud crisp.
        # PIL.rotate uses counter-clockwise positive angles; we want CW.
        if requested_rotation != 0:
            image = image.rotate(-requested_rotation, expand=True)
            print(f"[pipeline] rotated source by {requested_rotation}° "
                  f"=> {image.size[0]}x{image.size[1]}")

        # --- Optional downsample to keep point count predictable ---
        max_side = opts.crystal.sampling_max_side_px
        if max_side and max(image.size) > max_side:
            scale = max_side / max(image.size)
            new_size = (max(1, int(round(image.size[0] * scale))),
                        max(1, int(round(image.size[1] * scale))))
            image = image.resize(new_size, Image.LANCZOS)
            print(f"[pipeline] resized to sampling cap: {image.size[0]}x{image.size[1]} "
                  f"(cap={max_side}px)")
        image_rgb = np.asarray(image)

        # --- Optional background removal (must happen before depth) ---
        if opts.remove_bg:
            from bg_remove import remove_background

            t0 = time.perf_counter()
            image_rgb, _alpha = remove_background(image_rgb)
            image = Image.fromarray(image_rgb)
            timings["bg_remove_ms"] = (time.perf_counter() - t0) * 1000
            nonzero = int((_alpha > 0).sum()) if _alpha is not None else -1
            total = int(_alpha.size) if _alpha is not None else -1
            frac = (nonzero / total) if total > 0 else 0.0
            print(f"[pipeline] bg_remove: subject pixels={nonzero}/{total} "
                  f"({frac*100:.1f}%)")

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
        print(f"[pipeline] depth: shape={depth.shape}, "
              f"range={float(depth.min()):.3f}..{float(depth.max()):.3f}")

        # --- Optional face-aware enhancement ---
        # Best-effort: if face detection or face-depth blending fails for any
        # reason (mediapipe.solutions missing on macOS ARM, OOM on a huge image,
        # etc.) we still produce a cloud using the global depth map. Face
        # refinement is a quality upgrade, not a hard dependency.
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
            except Exception as e:
                print(f"[pipeline] face enhancement skipped: {type(e).__name__}: {e}")
                timings["face_depth_ms"] = 0.0

        # --- Persist image_rgb + depth so a future retune can skip the model ---
        if opts.save_depth_to_dir is not None:
            cache_dir = Path(opts.save_depth_to_dir)
            cache_dir.mkdir(parents=True, exist_ok=True)
            np.save(cache_dir / "image_rgb.npy", image_rgb)
            np.save(cache_dir / "depth.npy", depth)
            # Stash the rotation that was baked into the cache so a retune
            # job with a *different* rotation can compute the delta and apply
            # np.rot90 without re-running the depth model.
            (cache_dir / "meta.json").write_text(
                _json.dumps({"rotation": requested_rotation}),
            )
            print(f"[pipeline] cached depth+image to {cache_dir} "
                  f"(rotation={requested_rotation}°)")

    # --- Point cloud ---
    t0 = time.perf_counter()
    points = generate_points(image_rgb, depth, opts.crystal)
    timings["points_ms"] = (time.perf_counter() - t0) * 1000
    print(f"[pipeline] generated {points.shape[0]} points "
          f"in {timings['points_ms']:.0f} ms")

    # --- Text overlay points (appended) ---
    # Text points come back as (M, 3). Main points are now (N, 4) with an
    # intensity column. Pad the text cloud with intensity=1.0 (text always
    # burns at full power) so concat is shape-compatible.
    if opts.text_overlay and opts.text_overlay.lines:
        text_pts = generate_text_points(opts.text_overlay)
        if text_pts.size:
            if text_pts.shape[1] == 3 and points.shape[1] == 4:
                text_pts = np.concatenate(
                    [text_pts, np.ones((text_pts.shape[0], 1), dtype=np.float32)],
                    axis=1,
                )
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
