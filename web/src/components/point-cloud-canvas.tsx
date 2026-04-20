"use client";

import { useEffect, useRef } from "react";

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function portraitDensity(x: number, y: number, z: number) {
  const hx = x / 0.58;
  const hy = (y - 0.05) / 0.78;
  const hz = z / 0.55;
  const head = 1 - (hx * hx + hy * hy + hz * hz);
  if (head < 0) return 0;
  const taper = y < -0.25 ? 1 - (Math.abs(x) / 0.5) * ((-0.25 - y) * 2) : 1;
  const nose = Math.exp(-((x * x) / 0.01 + ((y + 0.05) ** 2) / 0.08 + ((z - 0.35) ** 2) / 0.08)) * 0.9;
  const cheekL = Math.exp(-(((x + 0.28) ** 2) / 0.02 + ((y + 0.05) ** 2) / 0.04 + ((z - 0.2) ** 2) / 0.06)) * 0.6;
  const cheekR = Math.exp(-(((x - 0.28) ** 2) / 0.02 + ((y + 0.05) ** 2) / 0.04 + ((z - 0.2) ** 2) / 0.06)) * 0.6;
  const eyeL = Math.exp(-(((x + 0.22) ** 2) / 0.012 + ((y - 0.15) ** 2) / 0.02 + ((z - 0.15) ** 2) / 0.08)) * 0.7;
  const eyeR = Math.exp(-(((x - 0.22) ** 2) / 0.012 + ((y - 0.15) ** 2) / 0.02 + ((z - 0.15) ** 2) / 0.08)) * 0.7;
  const brow = Math.exp(-(((y - 0.28) ** 2) / 0.005 + (x * x) / 0.15 + ((z - 0.25) ** 2) / 0.08)) * 0.4;
  const lips = Math.exp(-(((y + 0.3) ** 2) / 0.004 + (x * x) / 0.06 + ((z - 0.25) ** 2) / 0.05)) * 0.35;
  const chin = Math.exp(-(((y + 0.55) ** 2) / 0.02 + (x * x) / 0.06 + ((z - 0.15) ** 2) / 0.08)) * 0.4;
  const base = Math.max(0, head * taper);
  const features = nose + cheekL + cheekR + brow + lips + chin - eyeL - eyeR;
  return Math.max(0, Math.min(1, base * 0.45 + features * 0.9));
}

function generatePoints(
  count: number,
  seed: number,
  jitter: number,
  depth: number,
  pointy: number,
): Float32Array {
  const rand = mulberry32(seed);
  const pts: number[] = [];
  let tries = 0;
  const maxTries = count * 80;
  while (pts.length / 4 < count && tries < maxTries) {
    tries++;
    const x = (rand() - 0.5) * 2 * 0.7;
    const y = (rand() - 0.5) * 2 * 0.95;
    const z = (rand() - 0.5) * 2 * 0.6;
    const d = portraitDensity(x, y, z);
    const thresh = 0.18 + (1 - pointy) * 0.3;
    if (d * (0.7 + pointy * 0.6) > thresh + rand() * 0.35) {
      const jx = x + (rand() - 0.5) * jitter * 0.05;
      const jy = y + (rand() - 0.5) * jitter * 0.05;
      const jz = z * depth + (rand() - 0.5) * jitter * 0.05;
      pts.push(jx, jy, jz, d);
    }
  }
  return new Float32Array(pts);
}

function generatePlaceholder(count = 1400, seed = 3): Float32Array {
  const rand = mulberry32(seed);
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const shell = 0.88 + (rand() - 0.5) * 0.14;
    pts.push(
      r * Math.cos(t) * 0.6 * shell,
      u * 0.72 * shell,
      r * Math.sin(t) * 0.55 * shell,
      0.35 + rand() * 0.2,
    );
  }
  return new Float32Array(pts);
}

function parseAccent(c: string) {
  const m = c.match(/rgb[a]?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 148, g: 255, b: 168 };
}

interface Props {
  density?: number;
  depth?: number;
  jitter?: number;
  pointy?: number;
  rotationSpeed?: number;
  accent?: string;
  placeholder?: boolean;
  seed?: number;
  interactive?: boolean;
}

export function PointCloudCanvas({
  density = 0.5,
  depth = 1,
  jitter = 0.3,
  pointy = 0.5,
  rotationSpeed = 0.25,
  accent = "rgb(148, 255, 168)",
  placeholder = false,
  seed = 7,
  interactive = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ptsRef = useRef<Float32Array | null>(null);
  const rotRef = useRef({ y: -0.2, x: 0 });
  const dragRef = useRef({ down: false, px: 0, py: 0 });

  useEffect(() => {
    if (placeholder) {
      ptsRef.current = generatePlaceholder(1400, seed);
    } else {
      const count = Math.round(1500 + density * 18000);
      ptsRef.current = generatePoints(count, seed, jitter, depth, pointy);
    }
  }, [density, jitter, depth, pointy, seed, placeholder]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let last = performance.now();
    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!dragRef.current.down) rotRef.current.y += rotationSpeed * dt;

      const pts = ptsRef.current;
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      if (!pts) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const n = pts.length / 4;
      const cx = W / 2;
      const cy = H / 2;
      const scale = Math.min(W, H) * 0.42;
      const cosY = Math.cos(rotRef.current.y);
      const sinY = Math.sin(rotRef.current.y);
      const cosX = Math.cos(rotRef.current.x);
      const sinX = Math.sin(rotRef.current.x);

      const proj = new Float32Array(n * 4);
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        const x = pts[i * 4];
        const y = pts[i * 4 + 1];
        const z = pts[i * 4 + 2];
        const d = pts[i * 4 + 3];
        const x1 = cosY * x + sinY * z;
        const z1 = -sinY * x + cosY * z;
        const y1 = cosX * y - sinX * z1;
        const z2 = sinX * y + cosX * z1;
        const persp = 1.2 / (1.6 - z2 * 0.5);
        proj[i * 4] = cx + x1 * scale * persp;
        proj[i * 4 + 1] = cy - y1 * scale * persp;
        proj[i * 4 + 2] = z2;
        proj[i * 4 + 3] = d;
        idx[i] = i;
      }
      idx.sort((a, b) => proj[a * 4 + 2] - proj[b * 4 + 2]);

      const acc = parseAccent(accent);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < n; k++) {
        const i = idx[k];
        const sx = proj[i * 4];
        const sy = proj[i * 4 + 1];
        const z = proj[i * 4 + 2];
        const d = proj[i * 4 + 3];
        const depthT = (z + 0.8) / 1.6;
        if (placeholder) {
          const alpha = Math.max(0.03, Math.min(0.55, 0.08 + depthT * 0.35 + d * 0.15));
          const size = (0.5 + depthT * 0.9) * dpr;
          ctx.fillStyle = `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${alpha * 0.55})`;
          ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        } else {
          const alpha = Math.max(0.04, Math.min(1, 0.15 + depthT * 0.7 + d * 0.3));
          const size = (0.6 + depthT * 1.8 + d * 0.5) * dpr;
          ctx.fillStyle = `rgba(${acc.r}, ${acc.g}, ${acc.b}, ${alpha})`;
          ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onDown = (e: PointerEvent) => {
      if (!interactive) return;
      dragRef.current.down = true;
      dragRef.current.px = e.clientX;
      dragRef.current.py = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.down) return;
      const dx = e.clientX - dragRef.current.px;
      const dy = e.clientY - dragRef.current.py;
      dragRef.current.px = e.clientX;
      dragRef.current.py = e.clientY;
      rotRef.current.y += dx * 0.008;
      rotRef.current.x = Math.max(-0.8, Math.min(0.8, rotRef.current.x + dy * 0.008));
    };
    const onUp = () => { dragRef.current.down = false; };

    if (interactive) {
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [accent, rotationSpeed, interactive, placeholder]);

  return <canvas ref={canvasRef} style={{ cursor: interactive ? "grab" : "default", touchAction: "none" }} />;
}
