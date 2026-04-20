import type { JobOptions } from "./jobs";

export const DEFAULT_JOB_OPTIONS: JobOptions = {
  formats: ["stl", "glb", "dxf", "ply", "xyz"],
  content_preset: "portrait",
  laser_preset: "xtool_f1_ultra",
  density: 0.55,
  depth: 1.0,
  jitter: 0.3,
  pointy: 0.6,
  remove_bg: false,
  face_aware: true,
  face_strength: 0.8,
  size_x: 50,
  size_y: 50,
  size_z: 80,
};
