cat > PROJECT_BRIEF.md << 'EOF'
# Pointcloud3D — Project Brief

## What we're building

A web application that converts 2D photos into 3D point clouds optimized for inner-crystal laser engraving. This is a direct competitor to photopoints3d.com with better quality, better UX, and a hybrid pricing model (pay-per-export and subscriptions).

## Target market

- Small businesses running inner-crystal laser engravers (Haotian, xTool F1 Ultra, Commarker, Rock Solid)
- Hobbyist laser owners
- One-time gift buyers converting a special photo into a crystal keepsake

## Core value proposition

"Sharper point clouds for laser engraving. Pay per photo or subscribe for monthly exports. Unlimited re-exports per photo for 30 days."

## Feature list (MVP)

### Pipeline features
- Input formats: JPG, PNG, BMP
- Single-photo input (multi-photo blending is a future feature)
- Depth estimation via Depth Anything V2 Small (Apache-2.0 license, commercially safe)
- Face-aware depth enhancement (detect faces, apply secondary depth pass for facial features)
- Optional AI photo enhancement for blurry inputs (Real-ESRGAN or similar)
- Inner-crystal-engraving-specific optimizations (depth curve tuning, point distribution tuned for how lasers create fracture points in crystal)
- Background removal (AI-powered, producing black backgrounds as required by laser engraving)
- Output formats: STL (for RK-CAD/BSL lasers), GLB (for xTool), DXF (for green lasers), PLY and XYZ (bonus formats)
- Text overlay: up to 3 lines with font selection, text depth control
- All photopoints3d.com-equivalent parameters exposed in an "Advanced" dropdown:
  - Crystal size XYZ (mm), Margins XYZ (mm)
  - Z scale, smooth radius
  - Base density, max points per pixel, XY jitter, volumetric thickness, Z layers
  - Brightness, contrast, gamma
  - Point size, point rendering style, auto-rotate, edge feather

### UX features
- Live 3D preview in-browser (WYSIWYG — the preview reflects the actual export)
- Preset library: Portrait, Pet, Landscape, Object, Text/Logo (auto-configure all advanced parameters)
- Laser presets: xTool F1 Ultra, Haotian X1, Commarker B4 JPT, Rock Solid (auto-configure format + typical crystal size)
- Batch processing for logged-in subscribers (upload multiple photos, process all)
- Re-download history forever for logged-in users
- Variations: unlimited re-exports of the same source photo with different parameters within 30 days of purchase

### Account features
- User signup, login, password reset, email verification via Clerk
- Google OAuth login
- Subscription management + pay-as-you-go credits
- Saved laser presets tied to account
- Export history with one-click re-download
- Billing page with plan management

### Pricing model (subject to tuning)
- Pay-as-you-go: around $3.99–$4.99 per export, 3-pack for $9.99
- Subscription: $9.99/mo for 30 exports, $24.99/mo for 100 exports, $49.99/mo unlimited-fair-use
- Free tier: watermarked low-res preview before payment
- 30-day re-export window per photo

## Tech stack

- Frontend: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- 3D preview: Three.js via react-three-fiber
- Auth: Clerk
- Database: Neon Postgres (free tier)
- ORM: Drizzle ORM
- File storage: Cloudflare R2
- File uploads: presigned URLs directly to R2
- Payments: Stripe Checkout + Subscriptions + webhooks
- Email: Resend
- GPU worker: Python FastAPI on Mac Mini M4, exposed via Cloudflare Tunnel
- Job queue: Simple Postgres-based job table
- Hosting: Vercel for the Next.js app, Mac Mini for the Python worker
- ML models: Depth Anything V2 Small (PyTorch with MPS backend on Mac), MediaPipe or RetinaFace for face detection, Real-ESRGAN for optional photo enhancement, rembg or BiRefNet for background removal

## Architecture

User browser -> Vercel-hosted Next.js app (frontend + API routes) -> Neon Postgres / Clerk / Stripe / Cloudflare R2 -> Mac Mini Python worker (via Cloudflare Tunnel) which runs Depth Anything V2 Small + face detection + export logic, polls Postgres for queued jobs, writes results back to R2 and updates Postgres.

## Repo structure

pointcloud3D/
- web/                  Next.js app
- worker/               Python GPU worker
- PROJECT_BRIEF.md      This file
- README.md

## Step by Step build plan

-  1: Get Depth Anything V2 Small running on Mac locally. Convert depth map to point cloud. Export STL, GLB, DXF, PLY, XYZ. Compare to photopoints3d and tune until equivalent or better.
-  2: Face-aware depth enhancement. Background removal. Crystal-specific optimizations. Preset tuning.
-  3: Next.js scaffold. Clerk auth. Neon schema. R2 setup. Basic upload to preview to download flow (no payments yet).
-  4: Connect Mac Mini worker to Next.js via Cloudflare Tunnel. End-to-end real job.
-  5: Stripe Checkout (one-time), Subscriptions, webhooks, credit/quota tracking, free preview flow.
-  6: Live 3D preview with Three.js. Batch upload. Export history. Laser presets. Variations.
-  7: Optional photo enhancement. Polish. Landing copy. Legal pages. Soft launch.

## Non-goals (DO NOT BUILD)

- Multi-view photogrammetry
- Mesh outputs with textures
- Video-to-3D
- Mobile native apps
- Social features
- Complex admin dashboard

## Constraints and preferences

- Keep it simple. Fewer dependencies over clever abstractions.
- TypeScript strict mode on.
- Commit after each meaningful unit of work with descriptive messages.
- Concise code, avoid over-commenting.
- shadcn/ui components.
- Drizzle ORM, not Prisma.
- Server Components where possible, Client Components only when needed.
- Worker must run on Apple Silicon with MPS backend. No CUDA-only dependencies.
- All code runs locally or on free tiers until paying customers exist.

## Development setup

- Primary dev machine: M3 MacBook (2023) for most coding.
- GPU worker target: Mac Mini M4 (16 GB) where the Python worker will eventually run in production via Cloudflare Tunnel.
- Both machines run Apple Silicon so the Python pipeline must be MPS-compatible.

## Current status

Freshly cloned empty repo. Need to scaffold worker and web directories.
EOF
