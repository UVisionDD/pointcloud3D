# pointcloud3D

Convert 2D photos into 3D point clouds optimized for inner-crystal laser engraving.

See [PROJECT_BRIEF.md](PROJECT_BRIEF.md) for the full product brief, stack, and build plan.

## Repo layout

```
pointcloud3D/
├── worker/            Python GPU worker (Depth Anything V2 + export pipeline)
│   ├── .venv/         Python 3.11 virtualenv (gitignored)
│   ├── output/        Generated artifacts — images, depth maps, point clouds (gitignored)
│   ├── requirements.txt
│   ├── test_depth.py  Smoke test for the depth model on MPS
│   ├── pointcloud.py  Depth + image -> crystal-volume point cloud (density by brightness)
│   ├── exporters.py   Writers for PLY / STL / GLB / DXF / XYZ
│   └── generate.py    End-to-end CLI: photo -> all 5 export formats
├── web/               Next.js 15 app (not yet scaffolded)
├── PROJECT_BRIEF.md
└── README.md
```

Currently only the `worker/` pipeline smoke test exists. The Next.js app is intentionally not scaffolded yet — we're proving the depth-to-point-cloud pipeline first.

## Worker — depth smoke test

Runs Depth Anything V2 Small on Apple Silicon via PyTorch MPS and writes a visualized depth map.

### One-time setup

Requires Homebrew Python 3.11. If you don't have it:

```bash
brew install python@3.11
```

Then create the virtualenv and install dependencies:

```bash
python3.11 -m venv worker/.venv
worker/.venv/bin/pip install --upgrade pip
worker/.venv/bin/pip install -r worker/requirements.txt
```

The Depth Anything V2 Small checkpoint (~100 MB) downloads automatically on first run into the HuggingFace cache (`~/.cache/huggingface`).

### Run the test

```bash
# Uses a bundled sample image (downloaded once on first run).
worker/.venv/bin/python worker/test_depth.py

# Or point it at your own image:
worker/.venv/bin/python worker/test_depth.py path/to/photo.jpg
```

Outputs:
- `worker/output/sample.jpg` — the downloaded sample (first run only)
- `worker/output/depth.jpg` — normalized depth visualization

The script prints the selected device, model load time, and inference time.

### Expected output

On an M3 MacBook:

```
Device: mps
Model load: ~3–5 s (first run, then cached)
Inference:  ~200 ms for a 1024×704 image (after MPS warm-up)
```

## Worker — full pipeline (photo → point cloud → all export formats)

```bash
# Defaults: 50×50×80 mm crystal, 3 mm margins, all 5 formats.
worker/.venv/bin/python worker/generate.py path/to/photo.jpg

# Only emit PLY + STL, bump density, thicker volumetric shell.
worker/.venv/bin/python worker/generate.py photo.jpg \
    --formats ply,stl \
    --base-density 0.5 \
    --volumetric-thickness 0.12
```

Writes `<stem>.ply`, `<stem>.stl`, `<stem>.glb`, `<stem>.dxf`, `<stem>.xyz` into
`worker/output/`. All coordinates are in millimetres, origin at the
bottom-front-left corner of the crystal.

### Key parameters (all have CLI flags — see `--help`)

| Flag | Meaning |
| ---- | ------- |
| `--size-xyz X Y Z` | Crystal outer dimensions in mm (default 50 50 80). |
| `--margin-xyz X Y Z` | Empty mm inside each face. |
| `--base-density` | Probability a white pixel emits a point per layer (0–1). |
| `--max-points-per-pixel` | Ceiling across all Z layers. |
| `--z-layers` | Volumetric shell samples along Z. |
| `--volumetric-thickness` | Shell thickness as fraction of crystal Z. |
| `--z-scale` | How much of crystal Z the depth occupies (0–1). |
| `--xy-jitter` | Sub-pixel random offset to break grid. |
| `--brightness / --contrast / --gamma` | Source tonemap before density sampling. |
| `--depth-gamma` | Curve on the normalized depth. |
| `--no-invert-depth` | Disable closer-pixels-are-higher-Z (default is on). |
| `--point-size-mm` | Tetrahedron radius in the STL output. |
| `--seed` | RNG seed for reproducible clouds. |

Format notes:
- **STL / GLB** — for RK-CAD, BSL, xTool. Each point is exported as a tiny
  tetrahedron (STL) or as a native `POINTS` primitive (GLB).
- **DXF** — green-laser pipelines. Written as `POINT` entities.
- **PLY / XYZ** — native point-cloud formats, useful for previewing in
  MeshLab / CloudCompare and for `trimesh`-based tooling.
