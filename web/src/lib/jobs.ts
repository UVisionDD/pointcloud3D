import { z } from "zod";

/**
 * Shape of the `options` jsonb column on the jobs table. Mirrors the Python
 * worker's PipelineOptions / CrystalParams — any change here must be reflected
 * in worker/job_worker.py::options_from_job_row.
 */
export const jobOptionsSchema = z.object({
  // Stage toggles.
  formats: z
    .array(z.enum(["ply", "stl", "glb", "dxf", "xyz"]))
    .min(1)
    .default(["ply", "stl", "glb"]),
  remove_bg: z.boolean().default(false),
  face_aware: z.boolean().default(true),
  face_strength: z.number().min(0).max(1).default(0.8),

  // Crystal geometry (mm).
  size_x: z.number().positive().default(50),
  size_y: z.number().positive().default(50),
  size_z: z.number().positive().default(80),
  margin_x: z.number().min(0).default(3),
  margin_y: z.number().min(0).default(3),
  margin_z: z.number().min(0).default(3),

  // Distribution.
  base_density: z.number().min(0).max(1).default(0.35),
  max_points_per_pixel: z.number().int().min(1).max(20).default(4),
  xy_jitter: z.number().min(0).max(2).default(0.5),
  z_layers: z.number().int().min(1).max(16).default(3),
  volumetric_thickness: z.number().min(0).max(1).default(0.08),
  z_scale: z.number().min(0).max(1).default(0.85),

  // Tonemap.
  brightness: z.number().min(-1).max(1).default(0),
  contrast: z.number().min(0).max(3).default(1),
  gamma: z.number().min(0.1).max(5).default(1),

  // Depth curve.
  invert_depth: z.boolean().default(true),
  depth_gamma: z.number().min(0.1).max(5).default(1),

  // STL point size (mm).
  point_size_mm: z.number().min(0.01).max(1).default(0.08),

  // Preset slugs (applied server-side by the worker).
  content_preset: z
    .enum(["portrait", "pet", "landscape", "object", "text_logo"])
    .optional(),
  laser_preset: z
    .enum([
      "xtool_f1_ultra",
      "haotian_x1",
      "commarker_b4_jpt",
      "rock_solid",
      "green_dxf",
    ])
    .optional(),

  // Text overlay (up to 3 lines).
  text_lines: z
    .array(
      z.object({
        text: z.string().min(1).max(64),
        font_path: z.string().optional(),
        font_size_px: z.number().int().min(8).max(512).default(64),
      }),
    )
    .max(3)
    .optional(),
  text_center_x_mm: z.number().optional(),
  text_center_y_mm: z.number().optional(),
  text_z_mm: z.number().optional(),
  text_block_width_mm: z.number().optional(),
  text_z_layers: z.number().int().min(1).max(8).optional(),
  text_z_thickness_mm: z.number().optional(),

  seed: z.number().int().default(42),
});

export type JobOptions = z.infer<typeof jobOptionsSchema>;

export const createJobSchema = z.object({
  inputKey: z.string().min(1),
  options: jobOptionsSchema,
  sourceWidth: z.number().int().positive().optional(),
  sourceHeight: z.number().int().positive().optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
