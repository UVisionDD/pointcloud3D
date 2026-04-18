"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { PointCloudCanvas } from "@/components/point-cloud-canvas";

type PresetKey = "portrait" | "pet" | "landscape" | "object" | "logo";
type LaserKey = "xtool" | "haotian" | "commarker" | "rocksolid" | "custom";

interface Params {
  density: number; depth: number; jitter: number; pointy: number; auto: boolean;
  brightness: number; contrast: number; gamma: number; zlayers: number;
  marginX: number; marginY: number; invert: boolean;
}

const PRESET_PARAMS: Record<PresetKey, { density: number; depth: number; jitter: number; pointy: number }> = {
  portrait: { density: 0.55, depth: 1.0, jitter: 0.3, pointy: 0.6 },
  pet: { density: 0.7, depth: 1.05, jitter: 0.35, pointy: 0.7 },
  landscape: { density: 0.85, depth: 0.8, jitter: 0.25, pointy: 0.4 },
  object: { density: 0.5, depth: 1.15, jitter: 0.18, pointy: 0.8 },
  logo: { density: 0.35, depth: 1.2, jitter: 0.1, pointy: 0.9 },
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

const LASER_META: Record<LaserKey, string> = {
  xtool: "GLB",
  haotian: "STL",
  commarker: "STL",
  rocksolid: "DXF",
  custom: "any",
};

const PRESET_META: Record<PresetKey, string> = {
  portrait: "~1.2M",
  pet: "~1.5M",
  landscape: "~1.8M",
  object: "~900k",
  logo: "~600k",
};

const FORMATS = ["STL", "GLB", "DXF", "PLY", "XYZ"] as const;

function formatPts(n: number) {
  const v = Math.round(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2) + "M";
  if (v >= 1_000) return Math.round(v / 1_000).toLocaleString() + "k";
  return v.toLocaleString();
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
  const [preset, setPreset] = useState<PresetKey>("portrait");
  const [laser, setLaser] = useState<LaserKey>("xtool");
  const [params, setParams] = useState({
    density: 0.55, depth: 1.0, jitter: 0.3, pointy: 0.6, auto: true,
    brightness: 0, contrast: 1, gamma: 1, zlayers: 60, marginX: 3, marginY: 3, invert: false,
  });
  const [lines, setLines] = useState<string[]>(["", "", ""]);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [photo, setPhoto] = useState<{ name: string; size: number; previewUrl: string; file: File } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [procStage, setProcStage] = useState<"idle" | "uploading" | "processing" | "ready" | "error">("idle");
  const [procProgress, setProcProgress] = useState(0);
  const [sourceView, setSourceView] = useState<"photo" | "depth">("photo");
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(new Set(["STL", "GLB", "DXF", "PLY", "XYZ"]));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = PRESET_PARAMS[preset];
    setParams((prev) => ({ ...prev, ...p }));
  }, [preset]);

  // Simulated progress between real status checks.
  useEffect(() => {
    if (procStage !== "processing") return;
    const t = setInterval(() => {
      setProcProgress((p) => (p >= 92 ? 92 : p + 1 + Math.random() * 2));
    }, 250);
    return () => clearInterval(t);
  }, [procStage]);

  // Poll job status.
  useEffect(() => {
    if (!jobId || procStage !== "processing") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`);
        if (!r.ok) return;
        const data = (await r.json()) as { status?: string };
        if (cancelled) return;
        if (data.status === "succeeded") {
          setProcProgress(100);
          setTimeout(() => setProcStage("ready"), 250);
        } else if (data.status === "failed") {
          setProcStage("error");
          toast.error("Processing failed. Try a different photo.");
        }
      } catch {}
    };
    const interval = setInterval(poll, 2500);
    poll();
    return () => { cancelled = true; clearInterval(interval); };
  }, [jobId, procStage]);

  const onReset = () => {
    if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    setJobId(null);
    setProcStage("idle");
    setProcProgress(0);
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    if (!signedIn) {
      toast.error("Sign in to upload.");
      router.push("/sign-up");
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ name: file.name, size: file.size, previewUrl, file });
    setProcStage("uploading");
    setProcProgress(0);
    setBusy(true);

    try {
      const contentType = file.type === "image/png" ? "image/png" : file.type === "image/bmp" ? "image/bmp" : "image/jpeg";
      const presign = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType, sizeBytes: file.size }),
      });
      if (!presign.ok) throw new Error("upload-url failed");
      const { uploadUrl, key } = (await presign.json()) as { uploadUrl: string; key: string; jobId: string };

      setProcProgress(10);
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!put.ok) throw new Error("upload failed");
      setProcProgress(25);

      const opts = {
        formats: Array.from(selectedFormats).map((f) => f.toLowerCase()) as ("stl" | "glb" | "dxf" | "ply" | "xyz")[],
        remove_bg: bgRemoved,
        face_aware: true,
        face_strength: 0.8,
        size_x: 50, size_y: 50, size_z: 80,
        margin_x: params.marginX, margin_y: params.marginY, margin_z: 3,
        base_density: 0.22, max_points_per_pixel: 5, xy_jitter: params.jitter,
        z_layers: Math.round(params.zlayers / 15),
        volumetric_thickness: 0.08, z_scale: 0.85,
        brightness: params.brightness, contrast: params.contrast, gamma: params.gamma,
        invert_depth: params.invert, depth_gamma: 1,
        point_size_mm: 0.08,
        content_preset: PRESET_TO_SERVER[preset],
        laser_preset: LASER_TO_SERVER[laser],
        text_lines: lines.filter(Boolean).map((t) => ({ text: t, font_size_px: 64 })),
        seed: 42,
      };

      const job = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputKey: key, options: opts }),
      });
      if (!job.ok) throw new Error("job create failed");
      const { jobId: newJobId } = (await job.json()) as { jobId: string };
      setJobId(newJobId);
      setProcProgress(35);
      setProcStage("processing");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setProcStage("error");
    } finally {
      setBusy(false);
    }
  }, [signedIn, router, selectedFormats, bgRemoved, params, preset, laser, lines]);

  const onExport = async () => {
    if (!jobId) return;
    if (!signedIn) { router.push("/sign-up"); return; }
    if (plan && plan !== "free") {
      // Subscriber — direct download list.
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
  const ptsDisplay = formatPts(300000 + params.density * 2200000);
  const subOk = signedIn && plan && plan !== "free";
  const disabled = !ready || selectedFormats.size === 0 || busy;

  return (
    <div className="studio">
      <Rail
        preset={preset} setPreset={setPreset}
        laser={laser} setLaser={setLaser}
        params={params} setParams={setParams}
        lines={lines} setLines={setLines}
        photo={photo} bgRemoved={bgRemoved} setBgRemoved={setBgRemoved}
        onReset={onReset}
      />
      <div className="studio-grid">
        <section className="preview split">
          <SourcePane
            photo={photo}
            sourceView={sourceView}
            setSourceView={setSourceView}
            procStage={procStage}
            bgRemoved={bgRemoved}
            onFile={handleFile}
          />
          <CloudPane
            photo={photo}
            params={params}
            lines={lines}
            procStage={procStage}
            procProgress={procProgress}
            ptsDisplay={ptsDisplay}
          />
        </section>
        <ExportBar
          selectedFormats={selectedFormats}
          setSelectedFormats={setSelectedFormats}
          subOk={!!subOk}
          plan={plan}
          credits={credits}
          onExport={onExport}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ---------- Rail ----------
function Rail({
  preset, setPreset, laser, setLaser, params, setParams, lines, setLines,
  photo, bgRemoved, setBgRemoved, onReset,
}: {
  preset: PresetKey; setPreset: (v: PresetKey) => void;
  laser: LaserKey; setLaser: (v: LaserKey) => void;
  params: Params;
  setParams: React.Dispatch<React.SetStateAction<Params>>;
  lines: string[]; setLines: (v: string[]) => void;
  photo: { name: string } | null; bgRemoved: boolean; setBgRemoved: (v: boolean) => void;
  onReset: () => void;
}) {
  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="mono muted small">settings</div>
        {photo && <button className="rail-reset" onClick={onReset}>reset ↺</button>}
      </div>

      <Dropdown
        label="preset" value={preset} onChange={(v) => setPreset(v as PresetKey)}
        options={[
          { k: "portrait", label: "Portrait", desc: "Face-aware depth", meta: PRESET_META.portrait },
          { k: "pet", label: "Pet", desc: "Fur + eye detail", meta: PRESET_META.pet },
          { k: "landscape", label: "Landscape", desc: "Horizon-weighted", meta: PRESET_META.landscape },
          { k: "object", label: "Object", desc: "Hard edges", meta: PRESET_META.object },
          { k: "logo", label: "Logo / Text", desc: "Crisp silhouette", meta: PRESET_META.logo },
        ]}
      />

      <Dropdown
        label="laser" value={laser} onChange={(v) => setLaser(v as LaserKey)}
        options={[
          { k: "xtool", label: "xTool F1 Ultra", desc: "GLB · 50×50×80", meta: LASER_META.xtool },
          { k: "haotian", label: "Haotian X1", desc: "STL · 60×60×90", meta: LASER_META.haotian },
          { k: "commarker", label: "Commarker B4", desc: "STL · 40×40×60", meta: LASER_META.commarker },
          { k: "rocksolid", label: "Rock Solid C9", desc: "DXF · 50×50×100", meta: LASER_META.rocksolid },
          { k: "custom", label: "Custom", desc: "Set size below", meta: LASER_META.custom },
        ]}
      />

      <div className="rail-section">
        <Slider label="density" value={params.density} set={(v) => setParams({ ...params, density: v })} display={(v) => formatPts(300000 + v * 2200000) + " pts"} />
        <Slider label="depth" value={params.depth} set={(v) => setParams({ ...params, depth: v })} min={0.4} max={1.3} />
        <Slider label="jitter" value={params.jitter} set={(v) => setParams({ ...params, jitter: v })} />
        <Slider label="point" value={params.pointy} set={(v) => setParams({ ...params, pointy: v })} />
      </div>

      <Collapse title="advanced">
        <Slider label="brightness" value={params.brightness} set={(v) => setParams({ ...params, brightness: v })} min={-0.5} max={0.5} />
        <Slider label="contrast" value={params.contrast} set={(v) => setParams({ ...params, contrast: v })} min={0.5} max={1.5} />
        <Slider label="gamma" value={params.gamma} set={(v) => setParams({ ...params, gamma: v })} min={0.5} max={2} />
        <Slider label="z·layers" value={params.zlayers} set={(v) => setParams({ ...params, zlayers: v })} min={20} max={120} step={1} display={(v) => Math.round(v).toString()} />
        <div className="mini-row">
          <Slider label="margin·x" value={params.marginX} set={(v) => setParams({ ...params, marginX: v })} min={0} max={10} step={0.1} display={(v) => v.toFixed(1) + " mm"} />
          <Slider label="margin·y" value={params.marginY} set={(v) => setParams({ ...params, marginY: v })} min={0} max={10} step={0.1} display={(v) => v.toFixed(1) + " mm"} />
        </div>
        <div className="toggles">
          <Toggle label="auto-rotate" value={params.auto} set={(v) => setParams({ ...params, auto: v })} />
          <Toggle label="invert depth" value={params.invert} set={(v) => setParams({ ...params, invert: v })} />
          <Toggle label="bg removed" value={bgRemoved} set={setBgRemoved} />
        </div>
      </Collapse>

      <Collapse title="engrave text">
        <div className="text-lines">
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              className="text-line"
              placeholder={`Line ${i + 1}`}
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
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = options.find((o) => o.k === value);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={`dd-btn ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
        <span className="dd-label mono">{label}</span>
        <span className="dd-val">
          <span>{current?.label}</span>
          <span className="mono dd-meta">{current?.meta}</span>
        </span>
        <svg className="dd-caret" viewBox="0 0 10 10" width="10" height="10"><path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
      </button>
      {open && (
        <div className="dd-menu">
          {options.map((o) => (
            <button key={o.k} type="button" className={`dd-item ${value === o.k ? "on" : ""}`} onClick={() => { onChange(o.k); setOpen(false); }}>
              <span className="dd-dot" />
              <span className="dd-item-body">
                <span>{o.label}</span>
                {o.desc && <span className="mono dd-item-desc">{o.desc}</span>}
              </span>
              <span className="mono muted">{o.meta}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Slider ----------
function Slider({
  label, value, set, min = 0, max = 1, step = 0.01, display,
}: {
  label: string; value: number; set: (v: number) => void;
  min?: number; max?: number; step?: number; display?: (v: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const disp = display ? display(value) : value.toFixed(2);
  return (
    <div className="pc-slider">
      <div className="slider-head">
        <span className="s-label">{label}</span>
        <span className="s-val">{disp}</span>
      </div>
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <div className="slider-thumb" style={{ left: `${pct}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
      </div>
    </div>
  );
}

// ---------- Toggle ----------
function Toggle({ label, value, set }: { label: string; value: boolean; set: (v: boolean) => void }) {
  return (
    <label className={`pc-toggle ${value ? "on" : ""}`} onClick={() => set(!value)}>
      <span className="t-track"><span className="t-knob" /></span>
      <span className="mono">{label}</span>
    </label>
  );
}

// ---------- Collapse ----------
function Collapse({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="collapse">
      <button type="button" className="collapse-head" onClick={() => setOpen(!open)}>
        <span className="c-title">{title}</span>
        <span className="mono muted">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

// ---------- Source pane ----------
function SourcePane({
  photo, sourceView, setSourceView, procStage, bgRemoved, onFile,
}: {
  photo: { name: string; previewUrl: string } | null;
  sourceView: "photo" | "depth"; setSourceView: (v: "photo" | "depth") => void;
  procStage: string; bgRemoved: boolean; onFile: (f: File) => void;
}) {
  return (
    <div className="pane pane-source">
      <div className="pv-chrome">
        <div className="pv-chrome-l">
          <div className="chrome-dots"><i /><i /><i /></div>
          <div className="mono">source</div>
        </div>
        {photo ? (
          <div className="view-tabs">
            <button className={sourceView === "photo" ? "on" : ""} onClick={() => setSourceView("photo")}>Photo</button>
            <button className={sourceView === "depth" ? "on" : ""} onClick={() => setSourceView("depth")} disabled={procStage !== "ready"}>Depth</button>
          </div>
        ) : <div className="mono small muted">step 1 · upload</div>}
      </div>
      <div className="pv-body">
        {!photo ? (
          <UploadZone onFile={onFile} />
        ) : (
          <div className="photo-view">
            <div className="photo-frame" style={{ background: bgRemoved ? "#000" : "transparent" }}>
              {sourceView === "photo" ? <img src={photo.previewUrl} alt="source" /> : (
                <div style={{ width: "100%", height: "100%", background: "radial-gradient(circle at 50% 42%, #f0fff0, #304a38 60%, #000 100%)" }} />
              )}
              <CornerTicks />
            </div>
            {sourceView === "depth" && (
              <div className="depth-scale"><span>near</span><div className="scale-bar" /><span>far</span></div>
            )}
          </div>
        )}
      </div>
      {photo && (
        <div className="pv-foot">
          <div className="stat-group">
            <Stat k="file" v={photo.name} />
            <Stat k="status" v={procStage === "ready" ? "ready" : procStage === "error" ? "error" : "processing"} />
          </div>
        </div>
      )}
    </div>
  );
}

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      className={`uz ${drag ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
    >
      <div className="uz-inner">
        <svg viewBox="0 0 80 80" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="0.8">
          <rect x="6" y="6" width="68" height="68" rx="2" strokeDasharray="2 3" />
          <path d="M26 48 L40 34 L54 48" strokeWidth="1.2" />
          <line x1="40" y1="34" x2="40" y2="58" strokeWidth="1.2" />
        </svg>
        <div className="uz-title">Drop a photo</div>
        <div className="mono muted">JPG · PNG · BMP · up to 32 MP</div>
        <div className="uz-actions">
          <button type="button" className="pc-btn pc-btn-primary" onClick={() => inputRef.current?.click()}>Browse</button>
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/bmp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </div>
    </div>
  );
}

// ---------- Cloud pane ----------
function CloudPane({
  photo, params, lines, procStage, procProgress, ptsDisplay,
}: {
  photo: { name: string } | null;
  params: { density: number; depth: number; jitter: number; pointy: number; auto: boolean };
  lines: string[];
  procStage: string; procProgress: number; ptsDisplay: string;
}) {
  const ready = procStage === "ready";
  return (
    <div className="pane pane-cloud">
      <div className="pv-chrome">
        <div className="pv-chrome-l">
          <div className="chrome-dots"><i /><i /><i /></div>
          <div className="mono">{ready ? `~/jobs/${photo?.name?.replace(/\.[^.]+$/, "") || "new"}` : "preview"}</div>
        </div>
        <div className="pv-chrome-r mono">{ready ? "drag · rotate" : !photo ? "awaiting photo" : "processing…"}</div>
      </div>
      <div className="pv-body">
        <div className="cloud-wrap">
          <PointCloudCanvas
            density={ready ? params.density : 0.2}
            depth={ready ? params.depth : 1.0}
            jitter={ready ? params.jitter : 0.2}
            pointy={ready ? params.pointy : 0.5}
            rotationSpeed={ready ? (params.auto ? 0.28 : 0) : 0.18}
            placeholder={!ready}
          />
          <div className="cloud-overlay">
            <CornerTicks />
            {ready ? (
              <>
                <div className="overlay-label top-left" style={{ color: "var(--pc-accent)" }}>{(photo?.name || "SUBJECT_01").toUpperCase()}.ply</div>
                <div className="overlay-label top-right">{ptsDisplay} pts</div>
                <div className="overlay-label bottom-left">50 × 50 × 80 mm</div>
                <div className="overlay-label bottom-right">+x →</div>
                {lines.filter(Boolean).length > 0 && (
                  <div className="cloud-text">{lines.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}</div>
                )}
              </>
            ) : (
              <>
                <div className="overlay-label top-left muted">preview · empty</div>
                <div className="overlay-label top-right muted">awaiting source</div>
                <div className="overlay-label bottom-left muted">50 × 50 × 80 mm</div>
                <div className="overlay-label bottom-right muted">+x →</div>
                <div className="cloud-hint">
                  <div className="cloud-hint-title">Your point cloud renders here.</div>
                  <div className="mono muted small">drop a photo on the left to begin</div>
                </div>
              </>
            )}
          </div>
          {(procStage === "uploading" || procStage === "processing") && <ProcessingOverlay progress={procProgress} />}
        </div>
      </div>
      <div className="pv-foot">
        <div className="stat-group">
          <Stat k="pts" v={ready ? `${ptsDisplay}` : "—"} />
          <Stat k="size" v="50×50×80 mm" />
          <Stat k="depth" v={`${params.depth.toFixed(2)} z·scale`} />
          <Stat k="engine" v="depth-anything v2" hide="sm" />
        </div>
      </div>
    </div>
  );
}

function ProcessingOverlay({ progress }: { progress: number }) {
  const steps = [
    { k: "upload", label: "Upload", to: 15 },
    { k: "bgrm", label: "BG remove", to: 35 },
    { k: "depth", label: "Depth", to: 65 },
    { k: "face", label: "Face pass", to: 85 },
    { k: "cloud", label: "Sample", to: 100 },
  ];
  return (
    <div className="proc-overlay">
      <div className="proc-card">
        <div className="mono muted small">depth-anything v2 · mps</div>
        <div className="proc-big">{Math.round(progress)}<span className="unit">%</span></div>
        <div className="proc-bar"><div className="proc-fill" style={{ width: `${progress}%` }} /></div>
        <div className="proc-steps">
          {steps.map((s, i) => {
            const prev = i === 0 ? 0 : steps[i - 1].to;
            const done = progress >= s.to;
            const active = !done && progress >= prev;
            return (
              <div key={s.k} className={`proc-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                <span className="proc-dot" /><span>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, hide }: { k: string; v: string; hide?: string }) {
  return (
    <div className={`stat ${hide ? "hide-" + hide : ""}`}>
      <span className="muted">{k}</span><span>{v}</span>
    </div>
  );
}

function CornerTicks() {
  return <><span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" /></>;
}

// ---------- Export bar ----------
function ExportBar({
  selectedFormats, setSelectedFormats, subOk, plan, credits, onExport, disabled,
}: {
  selectedFormats: Set<string>; setSelectedFormats: (s: Set<string>) => void;
  subOk: boolean; plan: string | null; credits: number;
  onExport: () => void; disabled: boolean;
}) {
  const toggle = (k: string) => {
    const n = new Set(selectedFormats);
    if (n.has(k)) n.delete(k); else n.add(k);
    setSelectedFormats(n);
  };

  return (
    <div className="export-bar">
      <div className="eb-formats">
        <span className="mono">formats</span>
        {FORMATS.map((f) => (
          <button key={f} type="button" className={`fmt-chip ${selectedFormats.has(f) ? "on" : ""}`} onClick={() => toggle(f)}>
            <span className="mono">{f}</span>
          </button>
        ))}
      </div>
      <div className="eb-right">
        <div className="eb-price">
          {subOk ? (
            <>
              <div className="mono muted small">cost</div>
              <div className="eb-big">{plan === "max" ? "included" : `${credits} credits`}</div>
            </>
          ) : (
            <>
              <div className="mono muted small">you pay</div>
              <div className="eb-big">€1.99</div>
            </>
          )}
        </div>
        <button type="button" className="pc-btn pc-btn-primary pc-btn-lg" disabled={disabled} onClick={onExport}>
          {subOk ? "Export →" : "Pay & export →"}
        </button>
      </div>
    </div>
  );
}
