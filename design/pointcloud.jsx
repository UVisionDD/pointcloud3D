// Point cloud engine — generates and renders a portrait-shaped point cloud
// to a canvas. Deterministic from a seed, parameter-driven.

const { useEffect, useRef, useState, useMemo, useCallback } = React;

// ---- Deterministic PRNG ----
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Implicit "portrait": a head silhouette with cheekbones, nose, eye sockets.
// Returns a signed density in [0, 1] at a point in local space.
// x,y,z in roughly [-1,1] crystal coordinates.
function portraitDensity(x, y, z) {
  // Head ovoid
  const hx = x / 0.58;
  const hy = (y - 0.05) / 0.78;
  const hz = z / 0.55;
  const head = 1 - (hx * hx + hy * hy + hz * hz);
  if (head < 0) return 0;

  // Slight jaw taper
  const taper = y < -0.25 ? 1 - (Math.abs(x) / 0.5) * ((-0.25 - y) * 2) : 1;

  // Nose bridge — ridge along z
  const nose = Math.exp(-((x * x) / 0.01 + ((y + 0.05) * (y + 0.05)) / 0.08 + ((z - 0.35) * (z - 0.35)) / 0.08)) * 0.9;

  // Cheekbones
  const cheekL = Math.exp(-(((x + 0.28) * (x + 0.28)) / 0.02 + ((y + 0.05) * (y + 0.05)) / 0.04 + ((z - 0.2) * (z - 0.2)) / 0.06)) * 0.6;
  const cheekR = Math.exp(-(((x - 0.28) * (x - 0.28)) / 0.02 + ((y + 0.05) * (y + 0.05)) / 0.04 + ((z - 0.2) * (z - 0.2)) / 0.06)) * 0.6;

  // Eye sockets (carve out)
  const eyeL = Math.exp(-(((x + 0.22) * (x + 0.22)) / 0.012 + ((y - 0.15) * (y - 0.15)) / 0.02 + ((z - 0.15) * (z - 0.15)) / 0.08)) * 0.7;
  const eyeR = Math.exp(-(((x - 0.22) * (x - 0.22)) / 0.012 + ((y - 0.15) * (y - 0.15)) / 0.02 + ((z - 0.15) * (z - 0.15)) / 0.08)) * 0.7;

  // Brow ridge
  const brow = Math.exp(-(((y - 0.28) * (y - 0.28)) / 0.005 + (x * x) / 0.15 + ((z - 0.25) * (z - 0.25)) / 0.08)) * 0.4;

  // Lips
  const lips = Math.exp(-(((y + 0.3) * (y + 0.3)) / 0.004 + (x * x) / 0.06 + ((z - 0.25) * (z - 0.25)) / 0.05)) * 0.35;

  // Chin
  const chin = Math.exp(-(((y + 0.55) * (y + 0.55)) / 0.02 + (x * x) / 0.06 + ((z - 0.15) * (z - 0.15)) / 0.08)) * 0.4;

  const base = Math.max(0, head * taper);
  const features = nose + cheekL + cheekR + brow + lips + chin - eyeL - eyeR;
  return Math.max(0, Math.min(1, base * 0.45 + features * 0.9));
}

// Generate points. Returns Float32Array of [x,y,z, d, ...]
function generatePointCloud({ count, seed, jitter, depth, pointy }) {
  const rand = mulberry32(seed);
  const pts = [];
  let tries = 0;
  const maxTries = count * 80;
  // Rejection sample
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

// Generate a placeholder: sparse sphere/ovoid wireframe to hint at where
// the real cloud will render. Desaturated, lower density, uniform.
function generatePlaceholderCloud({ count = 1400, seed = 3 }) {
  const rand = mulberry32(seed);
  const pts = [];
  for (let i = 0; i < count; i++) {
    // Sample on/near a sphere shell with some radial jitter
    const u = rand() * 2 - 1;
    const t = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const shell = 0.88 + (rand() - 0.5) * 0.14;
    const x = r * Math.cos(t) * 0.6 * shell;
    const y = u * 0.72 * shell;
    const z = r * Math.sin(t) * 0.55 * shell;
    pts.push(x, y, z, 0.35 + rand() * 0.2);
  }
  return new Float32Array(pts);
}

function PointCloudCanvas({
  density = 0.5,
  depth = 1.0,
  jitter = 0.3,
  pointy = 0.5,
  rotationSpeed = 0.25,
  accent = "rgb(140, 255, 170)",
  bg = "transparent",
  interactive = true,
  placeholder = false,
  seed = 7,
  className,
  style,
}) {
  const canvasRef = useRef(null);
  const pointsRef = useRef(null);
  const rotRef = useRef({ y: -0.2, x: 0, manual: false, vy: 0, vx: 0, last: 0 });
  const dragRef = useRef({ down: false, px: 0, py: 0 });

  // Regenerate when density/jitter/pointy change — or when placeholder flips
  useEffect(() => {
    if (placeholder) {
      pointsRef.current = generatePlaceholderCloud({ count: 1400, seed });
    } else {
      const count = Math.round(1500 + density * 18000);
      pointsRef.current = generatePointCloud({ count, seed, jitter, depth, pointy });
    }
  }, [density, jitter, depth, pointy, seed, placeholder]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
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

    let lastT = performance.now();
    const tick = (now) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // Auto-rotate unless user is dragging
      if (!dragRef.current.down) {
        rotRef.current.y += rotationSpeed * dt;
        // Inertia from manual rotation
        rotRef.current.y += rotRef.current.vy * dt;
        rotRef.current.x += rotRef.current.vx * dt;
        rotRef.current.vy *= 0.92;
        rotRef.current.vx *= 0.92;
        // Ease X back toward 0
        rotRef.current.x *= 0.98;
      }

      draw(ctx, canvas, pointsRef.current, rotRef.current, {
        accent, bg, depth, placeholder,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Interactivity
    const onDown = (e) => {
      if (!interactive) return;
      dragRef.current.down = true;
      const p = pointFromEvent(e);
      dragRef.current.px = p.x;
      dragRef.current.py = p.y;
      rotRef.current.vy = 0;
      rotRef.current.vx = 0;
    };
    const onMove = (e) => {
      if (!dragRef.current.down) return;
      const p = pointFromEvent(e);
      const dx = p.x - dragRef.current.px;
      const dy = p.y - dragRef.current.py;
      dragRef.current.px = p.x;
      dragRef.current.py = p.y;
      rotRef.current.y += dx * 0.008;
      rotRef.current.x = Math.max(-0.8, Math.min(0.8, rotRef.current.x + dy * 0.008));
      rotRef.current.vy = dx * 0.4;
      rotRef.current.vx = dy * 0.4;
    };
    const onUp = () => {
      dragRef.current.down = false;
    };

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
  }, [rotationSpeed, accent, bg, interactive, depth, placeholder]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        touchAction: "none",
        cursor: interactive ? "grab" : "default",
        ...style,
      }}
    />
  );
}

function pointFromEvent(e) {
  const rect = e.currentTarget && e.currentTarget.getBoundingClientRect
    ? e.currentTarget.getBoundingClientRect()
    : { left: 0, top: 0 };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function draw(ctx, canvas, pts, rot, opts) {
  const W = canvas.width;
  const H = canvas.height;
  if (opts.bg === "transparent") {
    ctx.clearRect(0, 0, W, H);
  } else {
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, W, H);
  }
  if (!pts) return;

  const cx = W / 2;
  const cy = H / 2;
  const scale = Math.min(W, H) * 0.42;

  const cosY = Math.cos(rot.y), sinY = Math.sin(rot.y);
  const cosX = Math.cos(rot.x), sinX = Math.sin(rot.x);

  const n = pts.length / 4;
  // Project all points with depth
  const proj = new Float32Array(n * 4); // sx, sy, z, d
  for (let i = 0; i < n; i++) {
    const x = pts[i * 4];
    const y = pts[i * 4 + 1];
    const z = pts[i * 4 + 2];
    const d = pts[i * 4 + 3];
    // Rotate around Y
    let x1 = cosY * x + sinY * z;
    let z1 = -sinY * x + cosY * z;
    // Rotate around X
    let y1 = cosX * y - sinX * z1;
    let z2 = sinX * y + cosX * z1;
    // Simple perspective
    const persp = 1.2 / (1.6 - z2 * 0.5);
    proj[i * 4] = cx + x1 * scale * persp;
    proj[i * 4 + 1] = cy - y1 * scale * persp;
    proj[i * 4 + 2] = z2;
    proj[i * 4 + 3] = d;
  }

  // Sort by z (back to front) — cheap index sort
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  // Bucket sort by z for speed
  idx.sort((a, b) => proj[a * 4 + 2] - proj[b * 4 + 2]);

  // Accent color parsing
  const acc = parseColor(opts.accent);

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  ctx.globalCompositeOperation = "lighter";
  const isPh = opts.placeholder;
  for (let k = 0; k < n; k++) {
    const i = idx[k];
    const sx = proj[i * 4];
    const sy = proj[i * 4 + 1];
    const z = proj[i * 4 + 2];
    const d = proj[i * 4 + 3];
    const depthT = (z + 0.8) / 1.6;
    if (isPh) {
      // Dim, uniform, smaller — hints at future cloud
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
}

function parseColor(c) {
  // accept "rgb(r,g,b)" or "#rrggbb"
  if (c.startsWith("#")) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return { r, g, b };
  }
  const m = c.match(/rgb[a]?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    return { r: parts[0] | 0, g: parts[1] | 0, b: parts[2] | 0 };
  }
  return { r: 140, g: 255, b: 170 };
}

Object.assign(window, { PointCloudCanvas, generatePointCloud, portraitDensity });
