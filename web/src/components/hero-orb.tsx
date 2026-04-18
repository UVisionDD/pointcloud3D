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

function generatePoints(count: number, seed: number): Float32Array {
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
    if (d * 1.1 > 0.28 + rand() * 0.35) {
      pts.push(
        x + (rand() - 0.5) * 0.015,
        y + (rand() - 0.5) * 0.015,
        z + (rand() - 0.5) * 0.015,
        d,
      );
    }
  }
  return new Float32Array(pts);
}

export function HeroOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pts = generatePoints(8000, 7);
    const n = pts.length / 4;
    let rotY = -0.2;
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
    const proj = new Float32Array(n * 4);
    const idx = new Uint32Array(n);

    const tick = (now: number) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      rotY += 0.25 * dt;

      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const scale = Math.min(W, H) * 0.42;
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      for (let i = 0; i < n; i++) {
        const x = pts[i * 4];
        const y = pts[i * 4 + 1];
        const z = pts[i * 4 + 2];
        const d = pts[i * 4 + 3];
        const x1 = cosY * x + sinY * z;
        const z1 = -sinY * x + cosY * z;
        const persp = 1.2 / (1.6 - z1 * 0.5);
        proj[i * 4] = cx + x1 * scale * persp;
        proj[i * 4 + 1] = cy - y * scale * persp;
        proj[i * 4 + 2] = z1;
        proj[i * 4 + 3] = d;
        idx[i] = i;
      }
      idx.sort((a, b) => proj[a * 4 + 2] - proj[b * 4 + 2]);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < n; k++) {
        const i = idx[k];
        const sx = proj[i * 4];
        const sy = proj[i * 4 + 1];
        const z = proj[i * 4 + 2];
        const d = proj[i * 4 + 3];
        const depthT = (z + 0.8) / 1.6;
        const alpha = Math.max(0.04, Math.min(1, 0.15 + depthT * 0.7 + d * 0.3));
        const size = (0.6 + depthT * 1.8 + d * 0.5) * dpr;
        ctx.fillStyle = `rgba(148, 255, 168, ${alpha})`;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      }
      ctx.globalCompositeOperation = "source-over";
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    return () => {
      running = false;
      ro.disconnect();
    };
  }, []);

  return (
    <div className="hero-orb">
      <canvas ref={canvasRef} />
      <span className="tick tl" />
      <span className="tick tr" />
      <span className="tick bl" />
      <span className="tick br" />
    </div>
  );
}
