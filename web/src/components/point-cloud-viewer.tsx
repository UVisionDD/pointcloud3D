"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loads a PLY file into a BufferGeometry and renders it as a Three.js Points
 * primitive. PLY is the lightest format we emit and works well in the browser.
 */
function PointCloud({ url }: { url: string }) {
  const geom = useLoader(PLYLoader, url) as THREE.BufferGeometry;

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.12,
        sizeAttenuation: true,
        color: new THREE.Color("#e8f1ff"),
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );

  // Center + scale so the cloud always fits nicely in the viewport.
  const points = useMemo(() => {
    geom.computeBoundingBox();
    const bb = geom.boundingBox!;
    const center = new THREE.Vector3();
    bb.getCenter(center);
    const size = new THREE.Vector3();
    bb.getSize(size);
    const scale = 80 / Math.max(size.x, size.y, size.z);
    const object = new THREE.Points(geom, material);
    object.position.sub(center.multiplyScalar(scale));
    object.scale.setScalar(scale);
    return object;
  }, [geom, material]);

  return <primitive object={points} />;
}

export function PointCloudViewer({ url }: { url: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(true);

  useEffect(() => {
    // Lock background color to crystal-engraving-like dark by default.
    setDark(true);
  }, []);

  return (
    <div
      ref={ref}
      className="relative h-[520px] w-full overflow-hidden rounded-lg border"
      style={{ background: dark ? "#05070d" : "#f7f7f7" }}
    >
      <Canvas camera={{ position: [0, 0, 120], fov: 45 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} />
        <Suspense fallback={null}>
          <PointCloud url={url} />
        </Suspense>
        <OrbitControls enableDamping />
      </Canvas>
      <button
        type="button"
        onClick={() => setDark((d) => !d)}
        className="absolute right-3 top-3 rounded-md bg-background/70 px-2 py-1 text-xs backdrop-blur"
      >
        {dark ? "Light" : "Dark"}
      </button>
    </div>
  );
}

export function PointCloudViewerSkeleton() {
  return <Skeleton className="h-[520px] w-full" />;
}
