"use client";

import { useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

import { Skeleton } from "@/components/ui/skeleton";

export interface CrystalBounds {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  marginX: number;
  marginY: number;
  marginZ: number;
}

const DEFAULT_CRYSTAL: CrystalBounds = {
  sizeX: 50,
  sizeY: 50,
  sizeZ: 80,
  marginX: 3,
  marginY: 3,
  marginZ: 3,
};

// Browser-side decimation cap. Three.js can render ~1M points smoothly with
// AdditiveBlending on a typical laptop GPU; above that, frame rate craters
// and slider retunes feel sticky. The full PLY is still what gets engraved —
// this is purely the on-screen preview. Random-stride sampling preserves the
// visual character of the cloud (every brightness band stays represented).
const VIEWER_MAX_POINTS = 600_000;

/**
 * Decimate a BufferGeometry's position + color attributes down to roughly
 * `maxPoints` by random index sampling. Returns a NEW geometry — caller is
 * responsible for disposing both the input (if no longer needed) and output.
 *
 * We pick indices uniformly at random rather than every-Nth so the decimated
 * cloud doesn't show banding artifacts on regular grids. `maxPoints` is a
 * soft upper bound — actual count is exactly maxPoints unless the source has
 * fewer.
 */
function decimateGeometry(src: THREE.BufferGeometry, maxPoints: number): THREE.BufferGeometry {
  const posAttr = src.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!posAttr) return src;
  const total = posAttr.count;
  if (total <= maxPoints) return src;

  // Build a random index permutation, take the first `maxPoints`. A typed
  // array + Fisher-Yates shuffle is plenty fast even at a few M points.
  const idx = new Uint32Array(total);
  for (let i = 0; i < total; i++) idx[i] = i;
  for (let i = total - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }

  const out = new THREE.BufferGeometry();
  // PLYLoader returns Float32Array for position/normal/color (colors are
  // rescaled 0..1), so we can just allocate Float32Arrays without bothering
  // with the source's typed-array constructor.
  const pickAttr = (name: string): void => {
    const attr = src.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (!attr) return;
    const itemSize = attr.itemSize;
    const srcArr = attr.array as ArrayLike<number>;
    const dst = new Float32Array(maxPoints * itemSize);
    for (let i = 0; i < maxPoints; i++) {
      const srcOff = idx[i] * itemSize;
      const dstOff = i * itemSize;
      for (let k = 0; k < itemSize; k++) dst[dstOff + k] = srcArr[srcOff + k];
    }
    out.setAttribute(name, new THREE.BufferAttribute(dst, itemSize, attr.normalized));
  };
  pickAttr("position");
  pickAttr("color");
  pickAttr("normal");
  return out;
}

/**
 * Loads a PLY file into a BufferGeometry and renders it as a Three.js Points
 * primitive. PLY is the lightest format we emit and the one three.js loads
 * natively (with per-vertex colour if the PLY contains it).
 *
 * Key property: we load imperatively (not via useLoader / Suspense) and hold
 * onto the *previous* geometry until the new one finishes downloading. That
 * way a retune doesn't blink the cloud off-screen, and — combined with no
 * `key` on the Canvas — the OrbitControls camera stays exactly where the user
 * left it. The whole "every slider tick resets the camera to top-right" bug
 * was caused by `<Canvas key={url}>` forcing a full remount on URL change.
 *
 * Above VIEWER_MAX_POINTS we render a randomly-decimated copy in the browser
 * to keep slider drags fluid; the on-disk PLY/STL/GLB the user downloads
 * stays at full density, since that's what the laser actually consumes.
 *
 * Points come out of the worker in real millimetre coordinates — range is
 * [0, sizeX] × [0, sizeY] × [0, sizeZ] with the image fitting inside
 * (sizeX - 2·marginX, sizeY - 2·marginY). We shift the cloud by half the
 * crystal so the origin sits at the crystal's geometric centre; then a
 * wireframe box drawn around the origin visualises the physical envelope.
 */
function PointCloud({ url, crystal }: { url: string; crystal: CrystalBounds }) {
  const [geom, setGeom] = useState<THREE.BufferGeometry | null>(null);
  // Diagnostic: surface the actual rendered/source counts in the console so
  // we can confirm decimation kicked in when a user reports "viewer laggy".
  const [renderInfo, setRenderInfo] = useState<{ rendered: number; total: number } | null>(null);

  useEffect(() => {
    // Imperative load: we fetch in the background and only swap geom once
    // the new PLY has parsed. `cancelled` guards against late responses
    // firing after a second URL change (or unmount) and leaking buffers.
    let cancelled = false;
    const loader = new PLYLoader();
    loader.load(
      url,
      (next) => {
        if (cancelled) {
          next.dispose();
          return;
        }
        const total = (next.getAttribute("position") as THREE.BufferAttribute | undefined)?.count ?? 0;
        const display = total > VIEWER_MAX_POINTS ? decimateGeometry(next, VIEWER_MAX_POINTS) : next;
        // If we decimated, drop the original geometry's GPU buffers — we
        // hold onto only the smaller copy. If we didn't, display === next.
        if (display !== next) next.dispose();
        setGeom((prev) => {
          if (prev) prev.dispose();
          return display;
        });
        setRenderInfo({
          rendered: (display.getAttribute("position") as THREE.BufferAttribute).count,
          total,
        });
      },
      undefined,
      (err) => {
        // Presigned URL expiry or a malformed PLY — log loudly, keep the
        // old cloud on screen rather than crashing the canvas.
        console.warn("[point-cloud-viewer] ply load failed:", err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!renderInfo) return;
    if (renderInfo.rendered < renderInfo.total) {
      console.info(
        `[point-cloud-viewer] decimated ${renderInfo.total.toLocaleString()} → ` +
          `${renderInfo.rendered.toLocaleString()} for preview (full file used for export).`,
      );
    }
  }, [renderInfo]);

  const object = useMemo(() => {
    if (!geom) return null;
    const hasColor = !!geom.getAttribute("color");

    const material = new THREE.PointsMaterial({
      size: 0.35,
      sizeAttenuation: true,
      vertexColors: hasColor,
      color: hasColor ? 0xffffff : 0xe8f1ff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geom, material);
    // Shift the whole cloud so the crystal centre lands on the origin.
    // The worker positions points in [0..size], so translating by -size/2
    // centres both the cloud AND the wireframe box on (0, 0, 0).
    points.position.set(-crystal.sizeX / 2, -crystal.sizeY / 2, -crystal.sizeZ / 2);
    return points;
  }, [geom, crystal.sizeX, crystal.sizeY, crystal.sizeZ]);

  if (!object) return null;
  return <primitive object={object} />;
}

/**
 * Wireframe box visualising the crystal bounds. Outer (red) is the actual
 * physical crystal the user will buy; inner (dim white) is the engravable
 * envelope once the margin is subtracted — no point should ever render
 * outside it, which gives the user an at-a-glance sanity check that the
 * cloud fits their hardware.
 */
function CrystalFrame({ crystal }: { crystal: CrystalBounds }) {
  const { sizeX, sizeY, sizeZ, marginX, marginY, marginZ } = crystal;

  const outer = useMemo(() => new THREE.BoxGeometry(sizeX, sizeY, sizeZ), [sizeX, sizeY, sizeZ]);
  const outerEdges = useMemo(() => new THREE.EdgesGeometry(outer), [outer]);

  const innerX = Math.max(0, sizeX - 2 * marginX);
  const innerY = Math.max(0, sizeY - 2 * marginY);
  const innerZ = Math.max(0, sizeZ - 2 * marginZ);
  const inner = useMemo(
    () => new THREE.BoxGeometry(innerX, innerY, innerZ),
    [innerX, innerY, innerZ],
  );
  const innerEdges = useMemo(() => new THREE.EdgesGeometry(inner), [inner]);

  return (
    <>
      <lineSegments geometry={outerEdges}>
        <lineBasicMaterial
          color="#ff3b3b"
          transparent
          opacity={0.9}
          depthTest={false}
        />
      </lineSegments>
      <lineSegments geometry={innerEdges}>
        <lineBasicMaterial
          color="#7fa7c9"
          transparent
          opacity={0.3}
          depthTest={false}
        />
      </lineSegments>
    </>
  );
}

/**
 * Interactive 3D preview. Zoom with the scroll wheel, drag to rotate,
 * right-click (or two-finger) drag to pan. Fills its parent element —
 * callers are responsible for giving it a sized container.
 *
 * `url` is optional — when omitted, only the crystal wireframe renders,
 * which is what we show during the "configure crystal space" step so users
 * can size their block before committing to generate the cloud.
 *
 * `crystal` is optional; if omitted we use a sensible K9 default (50×50×80
 * with 3mm margins). Pass it in from the settings rail so the wireframe
 * tracks the user's actual crystal dimensions.
 */
export function PointCloudViewer({
  url,
  crystal = DEFAULT_CRYSTAL,
}: {
  url?: string;
  crystal?: CrystalBounds;
}) {
  // Frame the camera based on the largest crystal dimension — 2.4x keeps a
  // little breathing room around the red box at any orientation.
  const camZ = Math.max(crystal.sizeX, crystal.sizeY, crystal.sizeZ) * 2.4;

  return (
    // NB: deliberately NO `key` on the Canvas. Remounting it on every URL
    // change was what reset the OrbitControls camera every retune.
    <Canvas
      camera={{ position: [camZ * 0.6, camZ * 0.3, camZ], fov: 35, near: 0.1, far: 4000 }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <color attach="background" args={["#05070d"]} />
      <ambientLight intensity={0.9} />
      {url ? <PointCloud url={url} crystal={crystal} /> : null}
      <CrystalFrame crystal={crystal} />
      <OrbitControls
        enableDamping
        enablePan
        enableZoom
        enableRotate
        minDistance={camZ * 0.15}
        maxDistance={camZ * 4}
        zoomSpeed={0.9}
        rotateSpeed={0.9}
        panSpeed={0.9}
      />
    </Canvas>
  );
}

export function PointCloudViewerSkeleton() {
  return <Skeleton className="h-full w-full" />;
}
