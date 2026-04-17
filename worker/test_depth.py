"""Smoke test: run Depth Anything V2 Small on MPS and save depth map.

Usage:
    python test_depth.py [path/to/image.jpg]

If no path is given, downloads a sample image to worker/output/sample.jpg.
Writes the depth visualization to worker/output/depth.jpg.
"""
from __future__ import annotations

import sys
import time
import urllib.request
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

MODEL_ID = "depth-anything/Depth-Anything-V2-Small-hf"
SAMPLE_URL = "https://huggingface.co/datasets/huggingface/documentation-images/resolve/main/diffusers/cat.png"

HERE = Path(__file__).parent
OUTPUT_DIR = HERE / "output"


def resolve_input(argv: list[str]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if len(argv) > 1:
        p = Path(argv[1]).expanduser().resolve()
        if not p.exists():
            sys.exit(f"Input image not found: {p}")
        return p
    sample = OUTPUT_DIR / "sample.jpg"
    if not sample.exists():
        print(f"No input given. Downloading sample -> {sample}")
        urllib.request.urlretrieve(SAMPLE_URL, sample)
    return sample


def pick_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def main() -> None:
    image_path = resolve_input(sys.argv)
    device = pick_device()
    print(f"Device: {device}")
    print(f"Input:  {image_path}")

    image = Image.open(image_path).convert("RGB")
    print(f"Size:   {image.size[0]}x{image.size[1]}")

    load_start = time.perf_counter()
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL_ID).to(device).eval()
    print(f"Model load: {time.perf_counter() - load_start:.2f}s")

    inputs = processor(images=image, return_tensors="pt").to(device)

    # Warm-up pass (first MPS run includes kernel compilation).
    with torch.no_grad():
        _ = model(**inputs)
    if device.type == "mps":
        torch.mps.synchronize()

    infer_start = time.perf_counter()
    with torch.no_grad():
        outputs = model(**inputs)
    if device.type == "mps":
        torch.mps.synchronize()
    infer_elapsed = time.perf_counter() - infer_start
    print(f"Inference:  {infer_elapsed * 1000:.1f} ms")

    predicted = outputs.predicted_depth  # (1, H, W)
    depth = torch.nn.functional.interpolate(
        predicted.unsqueeze(1),
        size=image.size[::-1],  # (H, W)
        mode="bicubic",
        align_corners=False,
    ).squeeze().cpu().numpy()

    dmin, dmax = float(depth.min()), float(depth.max())
    print(f"Depth range: {dmin:.3f} .. {dmax:.3f}")
    normalized = (depth - dmin) / max(dmax - dmin, 1e-8)
    depth_u8 = (normalized * 255.0).astype(np.uint8)

    output_path = OUTPUT_DIR / "depth.jpg"
    cv2.imwrite(str(output_path), depth_u8)
    print(f"Saved:  {output_path}")


if __name__ == "__main__":
    main()
