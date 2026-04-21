"use client";

import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loads a PLY file into a BufferGeometry and renders it as a Three.js Points
 * primitive. PLY is the lightest format we emit and the one three.js loads
 * natively (with per-vertex colour if the PLY contains it).
 */
function PointCloud({ url }: { url: string }) {
  const geom = useLoader(PLYLoader, url) as THREE.BufferGeometry;

  const object = useMemo(() => {
    // Centre the cloud on the origin and scale it to a predictable size so
    // the default camera always frames it nicely regardless of the crystal
    // dimensions requested by the worker.
    geom.computeBoundingBox();
    const bb = geom.boundingBox!;
    const center = new THREE.Vector3();
    bb.getCenter(center);
    const size = new THREE.Vector3();
    bb.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const scale = 80 / maxDim;

    // If the worker embedded per-point colour (intensity written into the PLY
    // `color` element) use vertex colours; otherwise fall back to a cool
    // white that still reads as crystal-like.
    const hasColor = !!geom.getAttribute("color");

    const material = new THREE.PointsMaterial({
      size: 0.55,
      sizeAttenuation: true,
      vertexColors: hasColor,
      color: hasColor ? 0xffffff : 0xe8f1ff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geom, material);
    points.position.sub(center.clone().multiplyScalar(scale));
    points.scale.setScalar(scale);
    return points;
  }, [geom]);

  return <primitive object={object} />;
}

/**
 * Interactive 3D preview. Zoom with the scroll wheel, drag to rotate,
 * right-click (or two-finger) drag to pan. Fills its parent element —
 * callers are responsible for giving it a sized container.
 */
export function PointCloudViewer({ url }: { url: string }) {
  return (
    <Canvas
      // Force the whole scene to reset when a new job URL comes in so the
      // loader doesn't keep the previous geometry alive.
      key={url}
      camera={{ position: [0, 0, 135], fov: 40, near: 0.1, far: 2000 }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <color attach="background" args={["#05070d"]} />
      <ambientLight intensity={0.9} />
      <Suspense fallback={null}>
        <PointCloud url={url} />
      </Suspense>
      <OrbitControls
        enableDamping
        enablePan
        enableZoom
        enableRotate
        minDistance={20}
        maxDistance={400}
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
