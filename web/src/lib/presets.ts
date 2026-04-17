/**
 * Mirrors worker/presets.py. Used by the UI preset pickers. The worker
 * authoritatively applies presets at job run time — the values here are for
 * display / preview only.
 */

import type { JobOptions } from "./jobs";

export type ContentPresetKey = NonNullable<JobOptions["content_preset"]>;
export type LaserPresetKey = NonNullable<JobOptions["laser_preset"]>;

export interface ContentPreset {
  key: ContentPresetKey;
  name: string;
  description: string;
}

export interface LaserPreset {
  key: LaserPresetKey;
  name: string;
  vendor: string;
  defaultFormat: "ply" | "stl" | "glb" | "dxf" | "xyz";
  crystalSizeMm: [number, number, number];
  notes: string;
}

export const CONTENT_PRESETS: ContentPreset[] = [
  {
    key: "portrait",
    name: "Portrait",
    description: "Human subjects. Face-detail bias, softer Z, high skin contrast.",
  },
  {
    key: "pet",
    name: "Pet",
    description: "Dogs, cats, furry subjects. Higher density, rounder Z.",
  },
  {
    key: "landscape",
    name: "Landscape",
    description: "Full Z range, lower density to avoid muddy skies.",
  },
  {
    key: "object",
    name: "Object",
    description: "Product / still life. Balanced defaults.",
  },
  {
    key: "text_logo",
    name: "Text / Logo",
    description: "Flat graphics. High contrast, low Z variation.",
  },
];

export const LASER_PRESETS: LaserPreset[] = [
  {
    key: "xtool_f1_ultra",
    name: "xTool F1 Ultra",
    vendor: "xTool",
    defaultFormat: "glb",
    crystalSizeMm: [50, 50, 80],
    notes: "xTool Creative Space consumes GLB with a POINTS primitive natively.",
  },
  {
    key: "haotian_x1",
    name: "Haotian X1",
    vendor: "Haotian",
    defaultFormat: "stl",
    crystalSizeMm: [50, 50, 80],
    notes: "RK-CAD expects STL; each point as a tiny tetrahedron.",
  },
  {
    key: "commarker_b4_jpt",
    name: "Commarker B4 JPT",
    vendor: "Commarker",
    defaultFormat: "stl",
    crystalSizeMm: [50, 50, 80],
    notes: "BSL / EZCAD-driven; STL point clouds.",
  },
  {
    key: "rock_solid",
    name: "Rock Solid",
    vendor: "Rock Solid",
    defaultFormat: "stl",
    crystalSizeMm: [50, 50, 80],
    notes: "Rock Solid Laser software STL pipeline.",
  },
  {
    key: "green_dxf",
    name: "Generic Green Laser (DXF)",
    vendor: "Generic",
    defaultFormat: "dxf",
    crystalSizeMm: [40, 40, 60],
    notes: "POINT entities in DXF.",
  },
];

export const DEFAULT_JOB_OPTIONS: Partial<JobOptions> = {
  formats: ["ply", "stl", "glb"],
  face_aware: true,
  face_strength: 0.8,
  remove_bg: false,
  size_x: 50,
  size_y: 50,
  size_z: 80,
  margin_x: 3,
  margin_y: 3,
  margin_z: 3,
  base_density: 0.35,
  max_points_per_pixel: 4,
  xy_jitter: 0.5,
  z_layers: 3,
  volumetric_thickness: 0.08,
  z_scale: 0.85,
  brightness: 0,
  contrast: 1,
  gamma: 1,
  invert_depth: true,
  depth_gamma: 1,
  point_size_mm: 0.08,
  seed: 42,
};
