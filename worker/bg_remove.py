"""AI-powered background removal via rembg (U2-Net family).

Crystal engraving needs hard black backgrounds so the laser fires no pulses
outside the subject — otherwise the crystal looks fogged. We use rembg to
produce an alpha mask, then composite the subject onto pure black.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

try:
    from rembg import new_session, remove  # type: ignore
except ImportError:
    new_session = None  # type: ignore[assignment]
    remove = None  # type: ignore[assignment]

_SESSION = None


def _session(model_name: str = "u2net"):
    """Cache the rembg model session across calls."""
    global _SESSION
    if new_session is None:
        raise RuntimeError(
            "rembg not installed. `pip install rembg` to use background removal."
        )
    if _SESSION is None:
        _SESSION = new_session(model_name)
    return _SESSION


def remove_background(
    image_rgb: np.ndarray,
    model_name: str = "u2net",
    alpha_threshold: float = 0.5,
) -> tuple[np.ndarray, np.ndarray]:
    """Return (image_on_black, alpha) where alpha is 0..1 float32.

    alpha < threshold -> pixel becomes black in `image_on_black`.
    The alpha map itself is useful for downstream edge-feathering.
    """
    if remove is None:
        raise RuntimeError("rembg not installed.")
    pil = Image.fromarray(image_rgb)
    cut = remove(pil, session=_session(model_name))
    # rembg returns RGBA.
    rgba = np.array(cut.convert("RGBA"))
    alpha = rgba[..., 3].astype(np.float32) / 255.0
    rgb = rgba[..., :3]
    mask = (alpha >= alpha_threshold).astype(np.float32)[..., None]
    on_black = (rgb.astype(np.float32) * mask).astype(np.uint8)
    return on_black, alpha
