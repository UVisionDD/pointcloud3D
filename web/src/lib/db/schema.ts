import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  real,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * One row per Clerk user. We copy a small amount of profile data for
 * fast reads — Clerk remains the source of truth and a webhook keeps this
 * table in sync.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // Clerk user id, e.g. "user_abc".
    email: text("email").notNull(),
    displayName: text("display_name"),
    stripeCustomerId: text("stripe_customer_id"),
    // Quota state (subscription allowance is in `subscriptions.monthlyExports`).
    paygCredits: integer("payg_credits").notNull().default(0),
    // Which content preset & laser preset this user saw last (for UX nice-to-have).
    lastContentPreset: text("last_content_preset"),
    lastLaserPreset: text("last_laser_preset"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("users_email_idx").on(t.email),
    stripeIdx: index("users_stripe_idx").on(t.stripeCustomerId),
  }),
);

/**
 * A subscription bought via Stripe Checkout. There is at most one active row
 * per user; historical rows stay around for audit.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: text("id").primaryKey(), // Stripe subscription id.
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    stripePriceId: text("stripe_price_id").notNull(),
    plan: text("plan").notNull(), // 'basic' | 'pro' | 'max'
    status: text("status").notNull(), // active | past_due | canceled | trialing | etc.
    monthlyExports: integer("monthly_exports").notNull(), // 30 | 100 | -1 (unlimited)
    exportsUsedThisPeriod: integer("exports_used_this_period").notNull().default(0),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("subs_user_idx").on(t.userId),
  }),
);

/**
 * A processing job — one photo being converted to point clouds. Status flow:
 *     queued -> processing -> done | failed
 * The Mac Mini worker polls this table. See worker/job_worker.py.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(), // UUID v4.
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    inputKey: text("input_key").notNull(), // R2 key of source image.
    // JSON payload that maps to worker/pointcloud.CrystalParams + extras.
    options: jsonb("options").notNull(),
    // When done, result_keys = { ply: "...", stl: "...", glb: "..." }
    resultKeys: jsonb("result_keys"),
    timingsMs: jsonb("timings_ms"),
    error: text("error"),
    progress: real("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    workerId: text("worker_id"),
    // Source image metadata for the dashboard.
    thumbnailKey: text("thumbnail_key"),
    sourceWidth: integer("source_width"),
    sourceHeight: integer("source_height"),
    // 30-day re-export window begins when the first export is paid for.
    paidAt: timestamp("paid_at", { withTimezone: true }),
    reexportWindowEndsAt: timestamp("reexport_window_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("jobs_user_idx").on(t.userId),
    statusIdx: index("jobs_status_idx").on(t.status),
    createdIdx: index("jobs_created_idx").on(t.createdAt),
  }),
);

/**
 * One row per file we've written back to R2 for a job. Lets us show an
 * export history with per-format download buttons, and track re-download
 * counts for analytics.
 */
export const exports = pgTable(
  "exports",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    format: text("format").notNull(), // ply | stl | glb | dxf | xyz
    r2Key: text("r2_key").notNull(),
    sizeBytes: integer("size_bytes"),
    downloads: integer("downloads").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    jobIdx: index("exports_job_idx").on(t.jobId),
    userIdx: index("exports_user_idx").on(t.userId),
  }),
);

/**
 * A user-saved preset (their own tuned parameters). Tied to an account and
 * surfaced in the param UI dropdown.
 */
export const userPresets = pgTable(
  "user_presets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    options: jsonb("options").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("user_presets_user_idx").on(t.userId),
  }),
);

/**
 * Credit / export bookkeeping. Each row is an atomic change to a user's
 * available capacity. Simpler than recomputing from Stripe events.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(), // positive = grant, negative = consume
    reason: text("reason").notNull(), // 'payg_purchase' | 'job_export' | 'refund' | ...
    jobId: text("job_id"),
    stripeEventId: text("stripe_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("credits_user_idx").on(t.userId),
    eventIdx: uniqueIndex("credits_stripe_event_idx").on(t.stripeEventId),
  }),
);
