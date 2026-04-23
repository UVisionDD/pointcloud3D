"""AI-powered background removal via rembg (BiRefNet).

Crystal engraving needs hard black backgrounds so the laser fires no pulses
outside the subject — otherwise the crystal looks fogged. We use rembg to
produce an alpha mask, then composite the subject onto pure black.

Default model is `birefnet-portrait` (BiRefNet tuned for people/pets). It
pulls ~400 MB the first time rembg creates the session, then caches it
locally. On an M4 Mac Mini (CPU via ONNX Runtime) expect ~3–6 s per image;
quality is noticeably cleaner on hair/fur edges than the older u2net
default. Swap to `birefnet-general` for mixed subjects, or back to `u2net`
if you need to shave a couple of seconds.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

try:
    from rembg import new_session, remove  # type: ignore
except ImportError:
    new_session = None  # type: ignore[assignment]
    remove = None  # type: ignore[assignment]

# Module-level cache keyed on model name. We used to cache a single session
# regardless of the requested model, which silently ignored callers that
# asked for a different model on a warm process. Keying by name fixes that
# while still avoiding the ~1 s rembg setup cost on repeat calls.
_SESSIONS: dict[str, object] = {}

# BiRefNet-portrait gives much sharper hair/fur edges than u2net and is our
# default for every job (preview + full). Override per-call if you want to
# A/B a different backend.
DEFAULT_MODEL = "birefnet-portrait"


def _session(model_name: str = DEFAULT_MODEL):
    """Cache the rembg model session across calls, keyed by model name."""
    if new_session is None:
        raise RuntimeError(
            "rembg not installed. `pip install rembg` to use background removal."
        )
    sess = _SESSIONS.get(model_name)
    if sess is None:
        sess = new_session(model_name)
        _SESSIONS[model_name] = sess
    return sess


def remove_background(
    image_rgb: np.ndarray,
    model_name: str = DEFAULT_MODEL,
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
