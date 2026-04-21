"""Face-aware depth enhancement.

Problem: Depth Anything V2 Small gives good overall scene depth but can smear
facial features (eyes, nose, lips) because the whole image is downsampled into
a ~518 px inference. For crystal portraits, facial detail is the main signal.

Fix: detect faces, crop each face at higher effective resolution, re-run the
depth model on the crop, then blend the enhanced face depth back into the
global depth map with a feathered mask.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import torch
from PIL import Image

try:
    import mediapipe as mp
except ImportError:  # Allow importing this module without mediapipe installed.
    mp = None  # type: ignore[assignment]


@dataclass
class FaceBox:
    x: int
    y: int
    w: int
    h: int
    score: float

    def pad(self, pad_frac: float, img_w: int, img_h: int) -> "FaceBox":
        pad_x = int(self.w * pad_frac)
        pad_y = int(self.h * pad_frac)
        x0 = max(0, self.x - pad_x)
        y0 = max(0, self.y - pad_y)
        x1 = min(img_w, self.x + self.w + pad_x)
        y1 = min(img_h, self.y + self.h + pad_y)
        return FaceBox(x0, y0, x1 - x0, y1 - y0, self.score)


def _detect_faces_mediapipe(image_rgb: np.ndarray, min_score: float) -> list[FaceBox]:
    """Primary path: MediaPipe's `solutions.face_detection`. Not available on
    macOS ARM builds of mediapipe 0.10.14+ (the `solutions` module was
    dropped), so callers must tolerate AttributeError / ModuleNotFoundError.
    """
    if mp is None or not hasattr(mp, "solutions"):
        raise AttributeError("mediapipe.solutions not available")
    h, w = image_rgb.shape[:2]
    with mp.solutions.face_detection.FaceDetection(
        model_selection=1, min_detection_confidence=min_score
    ) as detector:
        result = detector.process(image_rgb)

    if not result.detections:
        return []

    boxes: list[FaceBox] = []
    for det in result.detections:
        rel = det.location_data.relative_bounding_box
        x = int(rel.xmin * w)
        y = int(rel.ymin * h)
        bw = int(rel.width * w)
        bh = int(rel.height * h)
        if bw <= 0 or bh <= 0:
            continue
        score = float(det.score[0]) if det.score else 0.0
        boxes.append(FaceBox(x, y, bw, bh, score))
    return boxes


def _detect_faces_opencv(image_rgb: np.ndarray) -> list[FaceBox]:
    """Fallback path: OpenCV Haar cascade, bundled with opencv-python. Lower
    accuracy than MediaPipe (frontal faces only, sensitive to lighting) but
    always available — no downloads, no native code quirks.
    """
    import cv2

    xml_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(xml_path)
    if cascade.empty():
        return []
    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)
    # scaleFactor=1.1, minNeighbors=5 is the cv2 docs default; minSize=30px
    # keeps tiny false-positives out.
    dets = cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
    )
    boxes: list[FaceBox] = []
    for (x, y, w, h) in dets:
        # Haar doesn't give a confidence score; use 1.0 so downstream thresholds
        # don't filter them out.
        boxes.append(FaceBox(int(x), int(y), int(w), int(h), 1.0))
    return boxes


def detect_faces(image_rgb: np.ndarray, min_score: float = 0.5) -> list[FaceBox]:
    """Try MediaPipe first, fall back to OpenCV Haar, give up silently if
    both fail. Returning [] is a valid outcome — the caller (face_depth)
    just skips face refinement and uses the global depth map as-is.
    """
    try:
        return _detect_faces_mediapipe(image_rgb, min_score)
    except (AttributeError, ImportError, ModuleNotFoundError) as e:
        print(f"[face_depth] mediapipe unavailable ({e}); trying OpenCV Haar")
    except Exception as e:
        print(f"[face_depth] mediapipe detection failed ({e}); trying OpenCV Haar")

    try:
        return _detect_faces_opencv(image_rgb)
    except Exception as e:
        print(f"[face_depth] OpenCV face detection failed ({e}); skipping face refinement")
        return []


def _feather_mask(h: int, w: int, box: FaceBox, feather: int) -> np.ndarray:
    """Rectangular mask with cosine-squared feathered edges."""
    import cv2

    mask = np.zeros((h, w), dtype=np.float32)
    x0, y0 = box.x, box.y
    x1, y1 = box.x + box.w, box.y + box.h
    mask[y0:y1, x0:x1] = 1.0
    if feather > 0:
        # Blur for soft edge.
        k = feather * 2 + 1
        mask = cv2.GaussianBlur(mask, (k, k), feather)
    return mask


def enhance_depth_on_faces(
    image_rgb: np.ndarray,
    depth: np.ndarray,
    processor,
    model,
    device: torch.device,
    pad_frac: float = 0.25,
    feather_px: int = 24,
    strength: float = 0.8,
) -> np.ndarray:
    """Run depth again on each face crop and blend back into the depth map.

    Args:
        image_rgb: (H, W, 3) uint8.
        depth: (H, W) float32 global depth.
        processor, model: HuggingFace DAv2 components (already on `device`).
        device: torch device.
        pad_frac: extra padding around each face bbox.
        feather_px: size of the blend-mask edge feather.
        strength: 0..1, how strongly face detail replaces the global depth
            (1.0 = full replace, 0.0 = no change).

    Returns:
        Enhanced depth map, same shape as `depth`.
    """
    boxes = detect_faces(image_rgb)
    if not boxes:
        return depth

    h, w = image_rgb.shape[:2]
    result = depth.copy().astype(np.float32)

    for box in boxes:
        padded = box.pad(pad_frac, w, h)
        crop = image_rgb[padded.y : padded.y + padded.h, padded.x : padded.x + padded.w]
        crop_pil = Image.fromarray(crop)

        inputs = processor(images=crop_pil, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = model(**inputs)
        if device.type == "mps":
            torch.mps.synchronize()

        face_depth = torch.nn.functional.interpolate(
            outputs.predicted_depth.unsqueeze(1),
            size=(padded.h, padded.w),
            mode="bicubic",
            align_corners=False,
        ).squeeze().cpu().numpy().astype(np.float32)

        # Rescale the crop depth to roughly match the global depth distribution
        # inside the box so the blended result stays consistent.
        global_region = result[
            padded.y : padded.y + padded.h, padded.x : padded.x + padded.w
        ]
        fmin, fmax = float(face_depth.min()), float(face_depth.max())
        gmin, gmax = float(global_region.min()), float(global_region.max())
        if fmax - fmin > 1e-6:
            face_norm = (face_depth - fmin) / (fmax - fmin)
        else:
            face_norm = np.zeros_like(face_depth)
        face_scaled = gmin + face_norm * (gmax - gmin)

        # Feathered mask over just this box, in global coords.
        mask = _feather_mask(h, w, padded, feather_px) * strength
        region_mask = mask[
            padded.y : padded.y + padded.h, padded.x : padded.x + padded.w
        ]
        blended = (
            region_mask * face_scaled + (1.0 - region_mask) * global_region
        )
        result[
            padded.y : padded.y + padded.h, padded.x : padded.x + padded.w
        ] = blended

    return result
