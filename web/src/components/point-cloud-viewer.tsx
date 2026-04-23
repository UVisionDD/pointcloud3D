"use client";

import { Suspense, useMemo } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
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

/**
 * Loads a PLY file into a BufferGeometry and renders it as a Three.js Points
 * primitive. PLY is the lightest format we emit and the one three.js loads
 * natively (with per-vertex colour if the PLY contains it).
 *
 * Points come out of the worker in real millimetre coordinates — range is
 * [0, sizeX] × [0, sizeY] × [0, sizeZ] with the image fitting inside
 * (sizeX - 2·marginX, sizeY - 2·marginY). We shift the cloud by half the
 * crystal so the origin sits at the crystal's geometric centre; then a
 * wireframe box drawn around the origin visualises the physical envelope.
 */
function PointCloud({ url, crystal }: { url: string; crystal: CrystalBounds }) {
  const geom = useLoader(PLYLoader, url) as THREE.BufferGeometry;

  const object = useMemo(() => {
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
 * `crystal` is optional; if omitted we use a sensible K9 default (50×50×80
 * with 3mm margins). Pass it in from the settings rail so the wireframe
 * tracks the user's actual crystal dimensions.
 */
export function PointCloudViewer({
  url,
  crystal = DEFAULT_CRYSTAL,
}: {
  url: string;
  crystal?: CrystalBounds;
}) {
  // Frame the camera based on the largest crystal dimension — 2.4x keeps a
  // little breathing room around the red box at any orientation.
  const camZ = Math.max(crystal.sizeX, crystal.sizeY, crystal.sizeZ) * 2.4;

  return (
    <Canvas
      // Force the whole scene to reset when a new job URL comes in so the
      // loader doesn't keep the previous geometry alive.
      key={url}
      camera={{ position: [camZ * 0.6, camZ * 0.3, camZ], fov: 35, near: 0.1, far: 4000 }}
      dpr={[1, 2]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <color attach="background" args={["#05070d"]} />
      <ambientLight intensity={0.9} />
      <Suspense fallback={null}>
        <PointCloud url={url} crystal={crystal} />
      </Suspense>
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
