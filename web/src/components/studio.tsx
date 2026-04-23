"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { toast } from "sonner";

import { PointCloudCanvas } from "@/components/point-cloud-canvas";
import { PointCloudViewer } from "@/components/point-cloud-viewer";
import { Wordmark } from "@/components/wordmark";

type PresetKey = "portrait" | "pet" | "landscape" | "object" | "logo";
type LaserKey = "xtool" | "haotian" | "commarker" | "rocksolid" | "custom";

interface Params {
  density: number;
  depth: number;
  jitter: number;
  pointy: number;
  auto: boolean;
  brightness: number;
  contrast: number;
  gamma: number;
  zlayers: number;
  marginX: number;
  marginY: number;
  invert: boolean;
}

// UI slider defaults per preset. `density` is 0..1 (maps straight to
// worker base_density). `depth` is 0..2.5 where 1.0 = "normal"; worker
// z_scale = 0.25 * depth so 1.0 → 0.25 (portrait-shallow), 2.2 → 0.55
// (landscape-wide). Keep these near the max so the first render looks
// rich — the user can tone it down from the top.
const PRESET_PARAMS: Record<PresetKey, Pick<Params, "density" | "depth" | "jitter" | "pointy">> = {
  portrait:  { density: 0.95, depth: 0.9, jitter: 0.5, pointy: 0.6 },
  pet:       { density: 1.0,  depth: 1.1, jitter: 0.55, pointy: 0.7 },
  landscape: { density: 1.0,  depth: 2.2, jitter: 0.5, pointy: 0.4 },
  object:    { density: 0.95, depth: 1.2, jitter: 0.5, pointy: 0.8 },
  logo:      { density: 1.0,  depth: 0.7, jitter: 0.3, pointy: 0.9 },
};

const PRESET_TO_SERVER: Record<PresetKey, "portrait" | "pet" | "landscape" | "object" | "text_logo"> = {
  portrait: "portrait",
  pet: "pet",
  landscape: "landscape",
  object: "object",
  logo: "text_logo",
};

const LASER_TO_SERVER: Record<LaserKey, "xtool_f1_ultra" | "haotian_x1" | "commarker_b4_jpt" | "rock_solid" | "green_dxf"> = {
  xtool: "xtool_f1_ultra",
  haotian: "haotian_x1",
  commarker: "commarker_b4_jpt",
  rocksolid: "rock_solid",
  custom: "green_dxf",
};

const LASER_FORMAT: Record<LaserKey, string> = {
  xtool: "GLB",
  haotian: "STL",
  commarker: "STL",
  rocksolid: "DXF",
  custom: "STL",
};

const FORMATS = ["STL", "GLB", "DXF", "PLY", "XYZ"] as const;

function formatPts(n: number) {
  const v = Math.round(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M pts";
  if (v >= 1_000) return Math.round(v / 1_000) + "k pts";
  return v + " pts";
}

interface StudioProps {
  signedIn: boolean;
  plan: string | null;
  credits: number;
  priceIds: {
    single: string | undefined;
  };
}

export function Studio({ signedIn, plan, credits, priceIds }: StudioProps) {
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [preset, setPreset] = useState<PresetKey>("portrait");
  const [laser, setLaser] = useState<LaserKey>("xtool");
  const [params, setParams] = useState<Params>({
    density: 0.95, depth: 0.9, jitter: 0.5, pointy: 0.6, auto: true,
    brightness: 0, contrast: 1, gamma: 1, zlayers: 90, marginX: 3, marginY: 3, invert: false,
  });
  const [lines, setLines] = useState<string[]>(["", "", ""]);
  const [bgRemoved, setBgRemoved] = useState(true);
  const [photo, setPhoto] = useState<{ name: string; size: number; previewUrl: string; file: File } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  // Parent job id — the *first* full-inference job for this photo, whose
  // cached depth map all subsequent retune jobs reuse. Stays fixed across
  // retunes so we don't repeatedly re-run the ~2-3s depth model.
  const [parentJobId, setParentJobId] = useState<string | null>(null);
  const [procStage, setProcStage] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const [procProgress, setProcProgress] = useState(0);
  const [selectedFormat, setSelectedFormat] = useState<string>("GLB");
  const [busy, setBusy] = useState(false);
  // URL of the result PLY the 3D viewer loads once the worker finishes.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pointCount, setPointCount] = useState<number | null>(null);
  // True while a retune child job is in flight. Deliberately separate from
  // procStage so the currently-rendered cloud stays on screen — swapping to
  // the placeholder on every slider tick was the "reloads the whole thing"
  // bug the user was complaining about.
  const [retuning, setRetuning] = useState(false);
  // Debounce handle for slider-driven retunes.
  const retuneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents the "params changed → retune" effect from firing on the very
  // first render after a successful upload (would re-queue the same job).
  const skipNextRetuneRef = useRef(false);

  // Apply theme
  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("pc3d-theme")) as "light" | "dark" | null;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("pc3d-theme", theme); } catch {}
  }, [theme]);

  // Lock body overflow while studio mounted
  useEffect(() => {
    document.body.classList.add("studio-body");
    return () => document.body.classList.remove("studio-body");
  }, []);

  // Preset -> params
  useEffect(() => {
    const p = PRESET_PARAMS[preset];
    setParams((prev) => ({ ...prev, ...p }));
  }, [preset]);

  // Simulated progress between status checks.
  useEffect(() => {
    if (procStage !== "processing") return;
    const t = setInterval(() => {
      setProcProgress((p) => (p >= 92 ? 92 : p + 1 + Math.random() * 2));
    }, 250);
    return () => clearInterval(t);
  }, [procStage]);

  // Poll job status.
  //
  // Two flavours:
  //  - Initial upload: procStage is "processing", we drive the big overlay
  //    + progress bar and only flip to "ready" once the PLY lands.
  //  - Retune: procStage stays "ready", the cloud on screen stays on
  //    screen, we just swap `previewUrl` when the new PLY is available.
  //    Poll fast (500ms) because retune rounds back in well under a second.
  useEffect(() => {
    if (!jobId) return;
    const isRetune = retuning;
    if (!isRetune && procStage !== "processing") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) return;
        // The API returns { job: { status, progress, error, ... } }.
        // Worker writes status='done' on success (see worker/db.py mark_done).
        const body = (await r.json()) as {
          job?: {
            status?: string;
            progress?: number;
            error?: string | null;
            timingsMs?: { points_count?: number } | null;
          };
          previewUrl?: string | null;
        };
        const job = body.job;
        if (cancelled || !job) return;

        // Only drive the progress bar for the initial upload — retune
        // shouldn't touch the progress indicator at all.
        if (!isRetune && typeof job.progress === "number") {
          const real = Math.round(job.progress * 100);
          setProcProgress((prev) => (real > prev ? Math.min(real, 99) : prev));
        }

        if (job.status === "done") {
          if (body.previewUrl) setPreviewUrl(body.previewUrl);
          if (job.timingsMs && typeof job.timingsMs.points_count === "number") {
            setPointCount(job.timingsMs.points_count);
          }
          if (isRetune) {
            setRetuning(false);
          } else {
            setProcProgress(100);
            setTimeout(() => setProcStage("ready"), 250);
          }
        } else if (job.status === "failed") {
          if (isRetune) {
            // Retune failure is quiet — keep the old cloud, log, move on.
            setRetuning(false);
            console.warn("[retune] failed:", job.error);
          } else {
            setProcStage("error");
            toast.error(job.error || "Processing failed. Try a different photo.");
          }
        }
      } catch {}
    };
    const interval = setInterval(poll, isRetune ? 500 : 2500);
    poll();
    return () => { cancelled = true; clearInterval(interval); };
  }, [jobId, procStage, retuning]);

  const onReset = () => {
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    if (retuneTimerRef.current) clearTimeout(retuneTimerRef.current);
    retuneTimerRef.current = null;
    setPhoto(null);
    setJobId(null);
    setParentJobId(null);
    setProcStage("idle");
    setProcProgress(0);
    setPreviewUrl(null);
    setPointCount(null);
  };

  /**
   * Map the UI params to the server-side job options shape. Kept as a pure
   * function so both the initial upload and the retune path produce the same
   * payload (minus `reuse_depth_from_job`, which retune adds itself).
   *
   * UI ranges are friendlier than the raw worker ones — e.g. `density` is 0..1
   * and we feed it straight into `base_density`, `depth` is 0.4..1.3 and we
   * scale the default z_scale by it, `zlayers` is 20..120 on the slider but
   * the sampler only wants 3..8.
   */
  const buildJobOptions = useCallback(() => {
    // Clamp z_scale in [0.05, 1.0]. The 0.25 coefficient is chosen so
    // params.depth=1.0 → zScale=0.25 (shallow-portrait target); a landscape
    // slider at 2.2 → zScale=0.55 which is dramatic without clipping.
    const zScale = Math.max(0.05, Math.min(1.0, 0.25 * params.depth));
    // Map the 20..120 UI slider to 4..9 real Bernoulli layers. More layers
    // multiply point count linearly but smooth z banding.
    const zLayers = Math.max(4, Math.min(9, Math.round(params.zlayers / 13)));
    // "Sharpness" slider — pointier = smaller tet on STL. Inverse mapping so
    // pointy=1 gives the crispest stipple, pointy=0 gives a softer look.
    const pointSizeMm = Math.max(0.04, 0.12 - 0.08 * params.pointy);
    return {
      formats: Array.from(new Set([
        "ply" as const,
        selectedFormat.toLowerCase() as "stl" | "glb" | "dxf" | "ply" | "xyz",
      ])),
      remove_bg: bgRemoved,
      face_aware: true,
      face_strength: 0.8,
      size_x: 50,
      size_y: 50,
      size_z: 80,
      margin_x: params.marginX,
      margin_y: params.marginY,
      margin_z: 3,
      base_density: Math.max(0.05, Math.min(1.0, params.density)),
      max_points_per_pixel: 15,
      xy_jitter: Math.max(0, Math.min(2, params.jitter)),
      z_layers: zLayers,
      sampling_max_side_px: 2500,
      volumetric_thickness: 0.08,
      z_scale: zScale,
      brightness: params.brightness,
      contrast: params.contrast,
      gamma: params.gamma,
      invert_depth: params.invert,
      depth_gamma: 1,
      intensity_gamma: 1,
      intensity_floor: 0.12,
      point_size_mm: pointSizeMm,
      content_preset: PRESET_TO_SERVER[preset],
      laser_preset: LASER_TO_SERVER[laser],
      text_lines: lines.filter(Boolean).map((t) => ({ text: t, font_size_px: 64 })),
      seed: 42,
    };
  }, [params, selectedFormat, bgRemoved, preset, laser, lines]);

  /**
   * Fire a retune job off the current parent. The worker downloads the
   * parent's cached depth + image and runs only the sampling + export stages,
   * so this typically comes back in < 1s. Called from a debounced effect
   * when any slider changes.
   */
  const requestRetune = useCallback(async () => {
    if (!parentJobId) return;
    try {
      const options = buildJobOptions();
      const r = await fetch(`/api/jobs/${parentJobId}/retune`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options }),
      });
      if (!r.ok) {
        // 409 no_depth_cache means the parent job predates depth caching.
        // Silently ignore — we'll keep showing the stale preview until the
        // user uploads a new photo.
        return;
      }
      const { jobId: childId } = (await r.json()) as { jobId: string };
      // Deliberately do NOT set procStage — the main viewer stays on the
      // previous cloud, and we only flip a small "updating…" badge on.
      // This is what makes slider drags feel live instead of "re-loading".
      setRetuning(true);
      setJobId(childId);
    } catch {
      // network errors during retune are silent — we still have the old cloud.
    }
  }, [parentJobId, buildJobOptions]);

  // Debounced auto-retune: any param / preset / format change after the first
  // full job has a cached depth map queues a retune ~450ms after the user
  // stops fiddling. Cheap (~500ms roundtrip on a small Mac Mini) so the cloud
  // feels almost live.
  useEffect(() => {
    if (!parentJobId) return;
    if (skipNextRetuneRef.current) {
      skipNextRetuneRef.current = false;
      return;
    }
    if (retuneTimerRef.current) clearTimeout(retuneTimerRef.current);
    retuneTimerRef.current = setTimeout(() => {
      retuneTimerRef.current = null;
      requestRetune();
    }, 450);
    return () => {
      if (retuneTimerRef.current) clearTimeout(retuneTimerRef.current);
    };
  }, [parentJobId, params, preset, laser, bgRemoved, lines, selectedFormat, requestRetune]);

  const handleLaserChange = (next: LaserKey) => {
    setLaser(next);
    const f = LASER_FORMAT[next];
    if (f) setSelectedFormat(f);
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    // Guests can upload and preview; sign-in is only required at checkout.
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ name: file.name, size: file.size, previewUrl, file });
    setProcStage("uploading");
    setProcProgress(0);
    setBusy(true);

    try {
      const contentType =
        file.type === "image/png" ? "image/png" :
        file.type === "image/bmp" ? "image/bmp" : "image/jpeg";
      let presign: Response;
      try {
        presign = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType, sizeBytes: file.size }),
        });
      } catch (e) {
        throw new Error(`Couldn't reach /api/upload-url (${e instanceof Error ? e.message : "network error"})`);
      }
      if (!presign.ok) {
        const msg = await presign.json().then((b) => b?.error).catch(() => null);
        throw new Error(typeof msg === "string" ? msg : `upload-url failed (${presign.status})`);
      }
      const { uploadUrl, key } = (await presign.json()) as { uploadUrl: string; key: string; jobId: string };

      setProcProgress(10);
      let put: Response;
      try {
        put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      } catch (e) {
        // Classic CORS failure on the presigned R2 URL shows up here as
        // "Failed to fetch". The bucket's CORS policy must allow this origin.
        throw new Error(
          `Upload to R2 blocked — check the bucket CORS policy allows ${typeof window !== "undefined" ? window.location.origin : "this origin"} (${e instanceof Error ? e.message : "network error"})`,
        );
      }
      if (!put.ok) throw new Error(`R2 PUT rejected (${put.status})`);
      setProcProgress(25);

      // Always ask the worker for PLY alongside whatever the user picked,
      // because the in-browser 3D preview loads PLY. The extra export is
      // cheap (~1-2s) and it means the preview works even if the user only
      // needs DXF/XYZ for their laser.
      const opts = buildJobOptions();

      let job: Response;
      try {
        job = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputKey: key, options: opts }),
        });
      } catch (e) {
        throw new Error(`Couldn't reach /api/jobs (${e instanceof Error ? e.message : "network error"})`);
      }
      if (!job.ok) {
        const msg = await job.json().then((b) => b?.error).catch(() => null);
        throw new Error(typeof msg === "string" ? msg : `job create failed (${job.status})`);
      }
      const { jobId: newJobId } = (await job.json()) as { jobId: string };
      // Skip the auto-retune effect that would otherwise fire once this new
      // jobId propagates through the param-changed deps.
      skipNextRetuneRef.current = true;
      setJobId(newJobId);
      // Parent id is the *first* full-inference job — all subsequent slider
      // changes retune against this one so the depth model only runs once.
      setParentJobId(newJobId);
      setProcProgress(35);
      setProcStage("processing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setProcStage("error");
    } finally {
      setBusy(false);
    }
  }, [buildJobOptions]);

  const onExport = async () => {
    if (!jobId) return;
    if (!signedIn) { router.push("/sign-up"); return; }
    if (plan && plan !== "free") {
      router.push(`/dashboard/jobs/${jobId}`);
      return;
    }
    if (!priceIds.single) {
      toast.error("Checkout not configured. Contact support.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: priceIds.single, mode: "payment", jobId }),
      });
      if (!r.ok) throw new Error("checkout failed");
      const { url } = (await r.json()) as { url: string };
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
      setBusy(false);
    }
  };

  const ready = procStage === "ready";
  const subOk = signedIn && plan && plan !== "free";
  const disabled = !ready || !selectedFormat || busy;

  return (
    <>
      <TopBar
        theme={theme}
        setTheme={setTheme}
        signedIn={signedIn}
        credits={credits}
        plan={plan}
      />
      <div className="studio">
        <SettingsRail
          preset={preset} setPreset={setPreset}
          laser={laser} setLaser={handleLaserChange}
          params={params} setParams={setParams}
          lines={lines} setLines={setLines}
          photo={photo} bgRemoved={bgRemoved} setBgRemoved={setBgRemoved}
          onReset={onReset}
        />
        <div className="studio-main">
          <Preview
            procStage={procStage}
            params={params}
            lines={lines}
            photo={photo}
            bgRemoved={bgRemoved}
            procProgress={procProgress}
            onFile={handleFile}
            onReset={onReset}
            previewUrl={previewUrl}
            pointCount={pointCount}
            retuning={retuning}
          />
          <ExportBar
            selectedFormat={selectedFormat}
            setSelectedFormat={setSelectedFormat}
            subOk={!!subOk}
            plan={plan}
            credits={credits}
            onExport={onExport}
            disabled={disabled}
          />
        </div>
      </div>
    </>
  );
}

// ---------- Top bar ----------
function TopBar({
  theme, setTheme, signedIn, credits, plan,
}: {
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  signedIn: boolean;
  credits: number;
  plan: string | null;
}) {
  return (
    <header className="topbar">
      <Wordmark size={14} />
      <div className="topbar-r">
        <button
          className="icon-btn"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        {signedIn ? (
          <>
            <div className="credit-chip">
              <span className="mono muted">{plan || "pay-as-you-go"}</span>
              <span className="credit-val">{plan === "max" ? "\u221E" : credits}</span>
            </div>
            <UserButton appearance={{ elements: { avatarBox: { width: 28, height: 28 } } }} />
          </>
        ) : (
          <>
            <Link href="/sign-in" className="btn btn-ghost">Sign in</Link>
            <Link href="/sign-up" className="btn btn-primary">Get started</Link>
          </>
        )}
      </div>
    </header>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
      <circle cx="8" cy="8" r="3.2" />
      <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <line x1="8" y1="1" x2="8" y2="3" />
        <line x1="8" y1="13" x2="8" y2="15" />
        <line x1="1" y1="8" x2="3" y2="8" />
        <line x1="13" y1="8" x2="15" y2="8" />
        <line x1="2.8" y1="2.8" x2="4.2" y2="4.2" />
        <line x1="11.8" y1="11.8" x2="13.2" y2="13.2" />
        <line x1="2.8" y1="13.2" x2="4.2" y2="11.8" />
        <line x1="11.8" y1="4.2" x2="13.2" y2="2.8" />
      </g>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
      <path d="M11.5 10.5A5.5 5.5 0 0 1 5.5 4.5a5.5 5.5 0 1 0 6 6z" />
    </svg>
  );
}
function ChevronDown() {
  return (
    <svg viewBox="0 0 10 10" width="9" height="9">
      <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- Settings rail ----------
function SettingsRail({
  preset, setPreset, laser, setLaser, params, setParams, lines, setLines,
  photo, bgRemoved, setBgRemoved, onReset,
}: {
  preset: PresetKey; setPreset: (v: PresetKey) => void;
  laser: LaserKey; setLaser: (v: LaserKey) => void;
  params: Params;
  setParams: React.Dispatch<React.SetStateAction<Params>>;
  lines: string[]; setLines: (v: string[]) => void;
  photo: { name: string } | null;
  bgRemoved: boolean; setBgRemoved: (v: boolean) => void;
  onReset: () => void;
}) {
  const sp = <K extends keyof Params>(k: K, v: Params[K]) =>
    setParams((p) => ({ ...p, [k]: v }));

  return (
    <aside className="rail">
      <div className="rail-top">
        <span className="rail-title">Settings</span>
        {photo && <button className="rail-reset" onClick={onReset}>Reset ↺</button>}
      </div>

      <div className="rail-sec">
        <Dropdown
          label="Photo type" value={preset}
          onChange={(v) => setPreset(v as PresetKey)}
          options={[
            { k: "portrait", label: "Portrait", desc: "Face-aware depth enhancement", meta: "~1.2M pts" },
            { k: "pet", label: "Pet", desc: "Detail for fur & eyes", meta: "~1.5M pts" },
            { k: "landscape", label: "Landscape", desc: "Horizon-weighted depth", meta: "~1.8M pts" },
            { k: "object", label: "Object", desc: "Sharp edges & hard surfaces", meta: "~900k pts" },
            { k: "logo", label: "Logo / Text", desc: "Crisp silhouette output", meta: "~600k pts" },
          ]}
        />
        <Dropdown
          label="Laser machine" value={laser}
          onChange={(v) => setLaser(v as LaserKey)}
          options={[
            { k: "xtool", label: "xTool F1 Ultra", desc: "Exports as GLB · 50×50×80 mm", meta: "GLB" },
            { k: "haotian", label: "Haotian X1", desc: "Exports as STL · 60×60×90 mm", meta: "STL" },
            { k: "commarker", label: "Commarker B4", desc: "Exports as STL · 40×40×60 mm", meta: "STL" },
            { k: "rocksolid", label: "Rock Solid C9", desc: "Exports as DXF · 50×50×100 mm", meta: "DXF" },
            { k: "custom", label: "Custom", desc: "Choose your format manually", meta: "any" },
          ]}
        />
        <Slider
          label="Point density" value={params.density}
          set={(v) => sp("density", v)}
          hint="More points = sharper result, longer engraving time"
          display={(v) => formatPts(300000 + v * 2200000)}
        />
      </div>

      <Collapse title="More settings">
        <Slider
          label="3D depth" value={params.depth} set={(v) => sp("depth", v)}
          min={0} max={2.5}
          hint="How strong the 3D effect appears in the crystal"
        />
        <Slider
          label="Point scatter" value={params.jitter} set={(v) => sp("jitter", v)}
          hint="Adds organic variation — reduces mechanical-looking patterns"
        />
        <Slider
          label="Sharpness" value={params.pointy} set={(v) => sp("pointy", v)}
          hint="How crisp each individual engraved point looks"
        />

        <div className="sub-label">Image adjustments</div>
        <Slider label="Brightness" value={params.brightness} set={(v) => sp("brightness", v)} min={-0.5} max={0.5} />
        <Slider label="Contrast"   value={params.contrast}   set={(v) => sp("contrast",   v)} min={0.5} max={1.5} />
        <Slider label="Gamma"      value={params.gamma}      set={(v) => sp("gamma",      v)} min={0.5} max={2.0} />

        <div className="sub-label">Crystal dimensions</div>
        <Slider
          label="Z layers" value={params.zlayers} set={(v) => sp("zlayers", v)}
          min={20} max={120} step={1}
          display={(v) => Math.round(v) + " layers"}
          hint="More layers = smoother depth transitions"
        />
        <div className="mini-row">
          <Slider label="Margin X" value={params.marginX} set={(v) => sp("marginX", v)} min={0} max={10} step={0.1} display={(v) => v.toFixed(1) + " mm"} />
          <Slider label="Margin Y" value={params.marginY} set={(v) => sp("marginY", v)} min={0} max={10} step={0.1} display={(v) => v.toFixed(1) + " mm"} />
        </div>

        <div className="sub-label">Options</div>
        <div className="toggles">
          <Toggle label="Auto-rotate preview" value={params.auto}   set={(v) => sp("auto",   v)} />
          <Toggle label="Background removed"  value={bgRemoved}     set={setBgRemoved} />
          <Toggle label="Invert depth"        value={params.invert} set={(v) => sp("invert", v)} />
        </div>
      </Collapse>

      <Collapse title="Add text to the crystal">
        <div className="text-lines">
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              className="text-line"
              placeholder={`Line ${i + 1} (optional)`}
              maxLength={32}
              value={lines[i] || ""}
              onChange={(e) => { const n = [...lines]; n[i] = e.target.value; setLines(n); }}
            />
          ))}
        </div>
      </Collapse>
    </aside>
  );
}

// ---------- Dropdown ----------
function Dropdown({
  label, value, options, onChange,
}: {
  label: string; value: string;
  options: { k: string; label: string; desc?: string; meta?: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find((o) => o.k === value);

  return (
    <div className="dd" ref={ref}>
      <button type="button" className={`dd-btn${open ? " open" : ""}`} onClick={() => setOpen(!open)}>
        <span className="dd-label">{label}</span>
        <span className="dd-val">
          <span>{cur?.label}</span>
          <span className="mono muted">{cur?.meta}</span>
        </span>
        <span className="dd-caret"><ChevronDown /></span>
      </button>
      {open && (
        <div className="dd-menu">
          {options.map((o) => (
            <button
              key={o.k}
              type="button"
              className={`dd-item${value === o.k ? " on" : ""}`}
              onClick={() => { onChange(o.k); setOpen(false); }}
            >
              <span className="dd-dot" />
              <span className="dd-ib">
                <span className="dd-name">{o.label}</span>
                {o.desc && <span className="dd-desc mono">{o.desc}</span>}
              </span>
              <span className="mono muted" style={{ fontSize: 10 }}>{o.meta}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Slider ----------
function Slider({
  label, value, set, min = 0, max = 1, step = 0.01, display, hint,
}: {
  label: string; value: number; set: (v: number) => void;
  min?: number; max?: number; step?: number;
  display?: (v: number) => string; hint?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const disp = display ? display(value) : value.toFixed(2);
  return (
    <div className="slider">
      <div className="slider-head">
        <span className="s-label">{label}</span>
        <span className="s-val">{disp}</span>
      </div>
      {hint && <div className="s-hint">{hint}</div>}
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <div className="slider-thumb" style={{ left: `${pct}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => set(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}

// ---------- Toggle ----------
function Toggle({ label, value, set }: { label: string; value: boolean; set: (v: boolean) => void }) {
  return (
    <label className={`toggle${value ? " on" : ""}`} onClick={() => set(!value)}>
      <span className="t-track"><span className="t-knob" /></span>
      <span>{label}</span>
    </label>
  );
}

// ---------- Collapse ----------
function Collapse({ title, children, startOpen = false }: { title: string; children: React.ReactNode; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className={`collapse${open ? " open" : ""}`}>
      <button type="button" className="collapse-head" onClick={() => setOpen(!open)}>
        <span className="c-title">{title}</span>
        <span className={`c-chev${open ? " up" : ""}`}><ChevronDown /></span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

// ---------- Preview (source + cloud panes) ----------
function Preview({
  procStage, params, lines, photo, bgRemoved, procProgress, onFile, onReset,
  previewUrl, pointCount, retuning,
}: {
  procStage: "idle" | "uploading" | "processing" | "ready" | "error";
  params: Params;
  lines: string[];
  photo: { name: string; previewUrl: string } | null;
  bgRemoved: boolean;
  procProgress: number;
  onFile: (f: File) => void;
  onReset: () => void;
  previewUrl: string | null;
  pointCount: number | null;
  retuning: boolean;
}) {
  const [srcView, setSrcView] = useState<"photo" | "depth">("photo");
  const ready = procStage === "ready";
  // Prefer the worker's real point count once we have it; fall back to the
  // slider-based estimate until the cloud arrives.
  const pts = formatPts(pointCount ?? 300000 + params.density * 2200000);
  const fname = photo?.name?.replace(/\.[^.]+$/, "") || "subject_01";

  return (
    <div className="preview">
      {/* Source pane */}
      <div className="pane">
        <div className="pane-chrome">
          <div className="chrome-l">
            <div className="chrome-dots"><i /><i /><i /></div>
            <span className="mono muted" style={{ fontSize: 10 }}>source</span>
          </div>
          {photo ? (
            <div className="view-tabs">
              <button className={srcView === "photo" ? "on" : ""} onClick={() => setSrcView("photo")}>Photo</button>
              <button className={srcView === "depth" ? "on" : ""} onClick={() => setSrcView("depth")} disabled={!ready}>Depth</button>
            </div>
          ) : (
            <span className="mono muted" style={{ fontSize: 10 }}>step 1 · upload</span>
          )}
        </div>
        <div className="pane-body">
          {!photo ? (
            <UploadZone onFile={onFile} />
          ) : srcView === "photo" ? (
            <PhotoView photo={photo} bgRemoved={bgRemoved} />
          ) : (
            <DepthView />
          )}
        </div>
        {photo && (
          <div className="pane-foot">
            <div className="stat-grp">
              <Stat k="file" v={photo.name} />
              <Stat k="status" v={
                procStage === "ready" ? "ready" :
                procStage === "error" ? "error" :
                procStage === "uploading" ? "uploading…" : "processing…"
              } />
            </div>
            <button className="rail-reset mono" onClick={onReset}>reset ↺</button>
          </div>
        )}
      </div>

      {/* Cloud pane — same header+footer skin as the source pane so the two
          always line up visually. */}
      <div className="pane">
        <div className="pane-chrome">
          <div className="chrome-l">
            <div className="chrome-dots"><i /><i /><i /></div>
            <span className="mono muted" style={{ fontSize: 10 }}>
              {ready ? `~/jobs/${fname}` : "point cloud preview"}
            </span>
          </div>
          <span
            className="mono muted"
            style={{ fontSize: 10, color: retuning ? "var(--accent)" : undefined }}
          >
            {retuning
              ? "updating…"
              : ready
                ? "drag · zoom · pan"
                : !photo
                  ? "awaiting photo"
                  : "processing…"}
          </span>
        </div>
        <div className="pane-body pane-body-cloud">
          {ready && previewUrl ? (
            // The real 3D viewer — loads the PLY the worker uploaded to R2.
            // Renders with OrbitControls so the user can zoom (wheel),
            // rotate (drag), and pan (right-click drag / two-finger).
            <div style={{ position: "absolute", inset: 0 }}>
              <PointCloudViewer url={previewUrl} />
            </div>
          ) : (
            // Placeholder until the worker returns. Uses the procedural
            // canvas so there's something alive on screen during upload.
            <div style={{ position: "absolute", inset: 0 }}>
              <PointCloudCanvas
                density={0.18}
                depth={1.0}
                jitter={0.15}
                pointy={0.5}
                rotationSpeed={0.14}
                placeholder
              />
            </div>
          )}
          <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <CornerTicks />
            {ready ? (
              <>
                <div className="ol ol-tl" style={{ color: "var(--accent)", opacity: 0.85 }}>
                  {fname.toUpperCase()}.ply
                </div>
                <div className="ol ol-tr">{pts}</div>
                <div className="ol ol-bl">50 × 50 × 80 mm</div>
                <div className="ol ol-br">depth-anything-v2</div>
                {lines.filter(Boolean).length > 0 && (
                  <div className="cloud-text">
                    {lines.filter(Boolean).map((l, i) => (<div key={i}>{l}</div>))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ol ol-tl muted" style={{ opacity: 0.3 }}>preview · empty</div>
                <div className="ol ol-tr muted" style={{ opacity: 0.3 }}>awaiting source</div>
                <div className="cloud-hint">
                  <div className="cloud-hint-title">Your point cloud renders here.</div>
                  <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                    drop a photo on the left to begin
                  </div>
                </div>
              </>
            )}
          </div>
          {(procStage === "processing" || procStage === "uploading") && (
            <ProcessingOverlay progress={procProgress} />
          )}
        </div>
        {photo && (
          <div className="pane-foot">
            <div className="stat-grp">
              <Stat k="points" v={ready ? pts : "—"} />
              <Stat k="format" v={ready ? "ply · preview" : "—"} />
            </div>
            <button
              className="rail-reset mono"
              disabled={!ready}
              style={{ opacity: ready ? 1 : 0.4 }}
              onClick={() => {
                // View full-screen by opening the raw signed PLY in a new
                // tab — handy for debugging and lets users inspect before
                // they pay to export.
                if (previewUrl) window.open(previewUrl, "_blank");
              }}
            >
              open raw ↗
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CornerTicks() {
  return (
    <>
      <span className="tick tl" /><span className="tick tr" />
      <span className="tick bl" /><span className="tick br" />
    </>
  );
}

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`uz${drag ? " drag" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0]; if (f) onFile(f);
      }}
    >
      <div className="uz-inner">
        <svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="0.9">
          <rect x="4" y="4" width="56" height="56" rx="3" strokeDasharray="2.5 3" />
          <path d="M22 40 L32 28 L42 40" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="32" y1="28" x2="32" y2="48" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <div className="uz-title">Drop a photo</div>
        <div className="mono" style={{ fontSize: 10, opacity: 0.4 }}>JPG · PNG · BMP · up to 32 MP</div>
        <div className="uz-actions">
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>Browse files</button>
        </div>
        <input
          ref={inputRef} type="file" accept="image/jpeg,image/png,image/bmp" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        />
      </div>
    </div>
  );
}

function PhotoView({ photo, bgRemoved }: { photo: { previewUrl: string }; bgRemoved: boolean }) {
  return (
    <div className="src-view">
      <div className="src-frame" style={{ background: bgRemoved ? "#000" : "#1a1612" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.previewUrl} alt="source" />
        <CornerTicks />
      </div>
    </div>
  );
}

function DepthView() {
  return (
    <div className="src-view">
      <div className="src-frame">
        <div style={{
          width: "100%", height: "100%",
          background: "radial-gradient(circle at 50% 42%, rgba(248,255,248,0.85), rgba(90,170,112,0.65) 35%, rgba(24,48,40,0.5) 70%, #000 100%)",
        }} />
        <CornerTicks />
      </div>
      <div className="depth-scale">
        <span className="mono muted">near</span>
        <div className="scale-bar" />
        <span className="mono muted">far</span>
      </div>
    </div>
  );
}

function ProcessingOverlay({ progress }: { progress: number }) {
  const steps = [
    { k: "upload", label: "Uploading",    to: 12 },
    { k: "bgrm",   label: "BG removal",   to: 32 },
    { k: "depth",  label: "Depth model",  to: 65 },
    { k: "face",   label: "Face pass",    to: 84 },
    { k: "sample", label: "Point sample", to: 100 },
  ];
  return (
    <div className="proc-overlay">
      <div className="proc-card">
        <div className="mono muted" style={{ fontSize: 10 }}>depth-anything-v2 · mps</div>
        <div className="proc-pct mono">
          {Math.round(progress)}<span className="proc-unit">%</span>
        </div>
        <div className="proc-bar"><div className="proc-fill" style={{ width: `${progress}%` }} /></div>
        <div className="proc-steps">
          {steps.map((s, i) => {
            const prev = i === 0 ? 0 : steps[i - 1].to;
            const done = progress >= s.to;
            const active = !done && progress >= prev;
            return (
              <div key={s.k} className={`proc-step${done ? " done" : ""}${active ? " active" : ""}`}>
                <span className="proc-dot" /><span className="mono">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="stat">
      <span className="mono muted">{k}</span>
      <span className="mono">{v}</span>
    </div>
  );
}

// ---------- Export bar ----------
function ExportBar({
  selectedFormat, setSelectedFormat, subOk, plan, credits, onExport, disabled,
}: {
  selectedFormat: string;
  setSelectedFormat: (f: string) => void;
  subOk: boolean;
  plan: string | null;
  credits: number;
  onExport: () => void;
  disabled: boolean;
}) {
  return (
    <div className="export-bar">
      <div className="eb-left">
        <span className="mono muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          output formats
        </span>
        <div className="fmt-chips">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              className={`fmt-chip${selectedFormat === f ? " on" : ""}`}
              onClick={() => setSelectedFormat(f)}
            >
              <span className="mono">{f}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="eb-right">
        <div className="eb-price">
          {subOk ? (
            <>
              <div className="mono muted" style={{ fontSize: 10 }}>cost</div>
              <div className="eb-amt">{plan === "max" ? "included" : `${credits} credits`}</div>
            </>
          ) : (
            <>
              <div className="mono muted" style={{ fontSize: 10 }}>you pay</div>
              <div className="eb-amt">€1.99</div>
            </>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={disabled}
          onClick={onExport}
        >
          {subOk ? "Export →" : "Pay & export →"}
        </button>
      </div>
    </div>
  );
}
