"""Render text lines into 3D point cloud points.

Text is rasterized with PIL, then pixels above a brightness threshold
become points placed at a fixed Z offset from the main cloud (inside the
crystal volume). Supports up to 3 lines stacked vertically.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


@dataclass
class TextLine:
    text: str
    font_path: str | None = None    # .ttf / .otf; None = PIL default.
    font_size_px: int = 64


@dataclass
class TextOverlayParams:
    lines: list[TextLine] = field(default_factory=list)
    # Placement inside the crystal volume (mm).
    center_x_mm: float = 25.0
    center_y_mm: float = 10.0      # low-Y area so text sits at the bottom
    z_mm: float = 20.0             # depth of the text plane inside crystal
    # Width of the text block in mm (height auto from font metrics).
    block_width_mm: float = 40.0
    # Point density: probability each lit pixel becomes a point.
    density: float = 1.0
    # How many depth layers to stack points across for a 3D-looking text.
    z_layers: int = 2
    z_thickness_mm: float = 1.5
    line_spacing: float = 1.15
    seed: int = 42


def _load_font(path: str | None, size: int) -> ImageFont.ImageFont:
    if path:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    # Fall back to a system default.
    return ImageFont.load_default(size=size)


def _render_text_mask(params: TextOverlayParams) -> np.ndarray:
    """Render the stacked text lines onto a white-on-black bitmap.

    Returns an HxW uint8 mask where >0 means "lit".
    """
    fonts = [_load_font(line.font_path, line.font_size_px) for line in params.lines]

    # Measure each line.
    dummy = Image.new("L", (1, 1))
    draw = ImageDraw.Draw(dummy)
    sizes: list[tuple[int, int]] = []
    for line, font in zip(params.lines, fonts):
        bbox = draw.textbbox((0, 0), line.text, font=font)
        sizes.append((bbox[2] - bbox[0], bbox[3] - bbox[1]))

    total_w = max((w for w, _ in sizes), default=1)
    gap = int(max(sz[1] for sz in sizes) * (params.line_spacing - 1.0)) if sizes else 0
    total_h = sum(h for _, h in sizes) + gap * max(0, len(sizes) - 1)
    pad = int(max(total_w, total_h) * 0.04) + 4
    canvas_w = total_w + 2 * pad
    canvas_h = total_h + 2 * pad

    img = Image.new("L", (canvas_w, canvas_h), 0)
    d = ImageDraw.Draw(img)
    y = pad
    for line, font, (w, h) in zip(params.lines, fonts, sizes):
        x = pad + (total_w - w) // 2
        d.text((x, y), line.text, fill=255, font=font)
        y += h + gap
    return np.array(img)


def generate_text_points(params: TextOverlayParams) -> np.ndarray:
    """Return (N, 3) float32 points for the stacked text lines, in mm."""
    if not params.lines:
        return np.zeros((0, 3), dtype=np.float32)

    mask = _render_text_mask(params)
    h, w = mask.shape
    if w == 0 or h == 0:
        return np.zeros((0, 3), dtype=np.float32)

    # Scale into mm: use block_width_mm as the X span; preserve aspect.
    mm_per_px = params.block_width_mm / w
    block_height_mm = h * mm_per_px

    origin_x = params.center_x_mm - params.block_width_mm / 2.0
    origin_y = params.center_y_mm - block_height_mm / 2.0

    rng = np.random.default_rng(params.seed)
    layers = max(1, params.z_layers)
    all_pts: list[np.ndarray] = []

    # Sample only bright pixels (> 128).
    ys, xs = np.nonzero(mask > 128)
    if xs.size == 0:
        return np.zeros((0, 3), dtype=np.float32)

    for layer_idx in range(layers):
        keep = rng.random(xs.size) < params.density
        lx, ly = xs[keep], ys[keep]
        if lx.size == 0:
            continue
        x_mm = origin_x + (lx + 0.5) * mm_per_px
        # Flip Y so rendered top is high Y in crystal space.
        y_mm = origin_y + ((h - 1 - ly) + 0.5) * mm_per_px

        if layers == 1:
            z_rel = 0.0
        else:
            z_rel = (layer_idx / (layers - 1) - 0.5) * params.z_thickness_mm
        z_mm = np.full_like(x_mm, params.z_mm + z_rel, dtype=np.float32)
        pts = np.stack([x_mm, y_mm, z_mm], axis=1).astype(np.float32)
        all_pts.append(pts)

    if not all_pts:
        return np.zeros((0, 3), dtype=np.float32)
    return np.concatenate(all_pts, axis=0)


def list_system_fonts() -> list[Path]:
    """Helper: list common TTF font paths on macOS/Linux for UI dropdowns."""
    candidates = [
        Path("/System/Library/Fonts"),
        Path("/Library/Fonts"),
        Path.home() / "Library/Fonts",
        Path("/usr/share/fonts"),
        Path("/usr/local/share/fonts"),
    ]
    found: list[Path] = []
    for base in candidates:
        if base.exists():
            found.extend(sorted(base.rglob("*.ttf")))
            found.extend(sorted(base.rglob("*.otf")))
    return found
