// StudioComponents.jsx — pointcloud3d refined studio

const { useState, useEffect, useRef } = React;

function fmtPts(n) {
  const v = Math.round(n);
  if (v >= 1_000_000) return (v/1_000_000).toFixed(2) + "M pts";
  if (v >= 1_000) return Math.round(v/1_000) + "k pts";
  return v + " pts";
}

function Wordmark({ size = 15 }) {
  return (
    <span className="wm" style={{ fontSize: size }}>
      <span className="wm-dim">point</span>
      <span className="wm-dot">·</span>
      <span className="wm-dim">cloud</span>
      <span className="wm-dot">·</span>
      <span className="wm-hi">3d</span>
    </span>
  );
}

function SunIcon() {
  return <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><circle cx="8" cy="8" r="3.2"/><g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/><line x1="2.8" y1="2.8" x2="4.2" y2="4.2"/><line x1="11.8" y1="11.8" x2="13.2" y2="13.2"/><line x1="2.8" y1="13.2" x2="4.2" y2="11.8"/><line x1="11.8" y1="4.2" x2="13.2" y2="2.8"/></g></svg>;
}
function MoonIcon() {
  return <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M11.5 10.5A5.5 5.5 0 0 1 5.5 4.5a5.5 5.5 0 1 0 6 6z"/></svg>;
}
function ChevronDown() {
  return <svg viewBox="0 0 10 10" width="9" height="9"><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

// ---- Top bar ----
function TopBar({ theme, setTheme, signedIn, setSignedIn, credits, plan, onAuth }) {
  return (
    <header className="topbar">
      <Wordmark size={14} />
      <div className="topbar-r">
        <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Toggle theme">
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        {signedIn ? (
          <>
            <div className="credit-chip">
              <span className="t-mono t-muted">{plan || "pay-as-you-go"}</span>
              <span className="credit-val">{plan === "max" ? "∞" : credits}</span>
            </div>
            <button className="avatar" onClick={() => setSignedIn(false)} title="Sign out">JM</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => onAuth("in")}>Sign in</button>
            <button className="btn btn-primary" onClick={() => onAuth("up")}>Get started</button>
          </>
        )}
      </div>
    </header>
  );
}

// ---- Dropdown ----
function Dropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = options.find(o => o.k === value);
  return (
    <div className="dd" ref={ref}>
      <button className={`dd-btn${open ? " open" : ""}`} onClick={() => setOpen(!open)}>
        <span className="dd-label">{label}</span>
        <span className="dd-val">
          <span>{cur?.label}</span>
          <span className="t-mono t-muted">{cur?.meta}</span>
        </span>
        <span className="dd-caret"><ChevronDown /></span>
      </button>
      {open && (
        <div className="dd-menu">
          {options.map(o => (
            <button key={o.k} className={`dd-item${value === o.k ? " on" : ""}`}
              onClick={() => { onChange(o.k); setOpen(false); }}>
              <span className="dd-dot" />
              <span className="dd-ib">
                <span className="dd-name">{o.label}</span>
                {o.desc && <span className="dd-desc t-mono">{o.desc}</span>}
              </span>
              <span className="t-mono t-muted" style={{ fontSize: 10 }}>{o.meta}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Slider ----
function Slider({ label, value, set, min = 0, max = 1, step = 0.01, display, hint }) {
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
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => set(parseFloat(e.target.value))} />
      </div>
    </div>
  );
}

// ---- Toggle ----
function Toggle({ label, value, set }) {
  return (
    <label className={`toggle${value ? " on" : ""}`} onClick={() => set(!value)}>
      <span className="t-track"><span className="t-knob" /></span>
      <span className="t-mono">{label}</span>
    </label>
  );
}

// ---- Collapse ----
function Collapse({ title, children, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div className={`collapse${open ? " open" : ""}`}>
      <button className="collapse-head" onClick={() => setOpen(!open)}>
        <span className="c-title">{title}</span>
        <span className={`c-chev${open ? " up" : ""}`}><ChevronDown /></span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

// ---- Settings rail ----
const PRESET_PARAMS = {
  portrait:  { density: 0.55, depth: 1.00, jitter: 0.30, pointy: 0.60 },
  pet:       { density: 0.70, depth: 1.05, jitter: 0.35, pointy: 0.70 },
  landscape: { density: 0.85, depth: 0.80, jitter: 0.25, pointy: 0.40 },
  object:    { density: 0.50, depth: 1.15, jitter: 0.18, pointy: 0.80 },
  logo:      { density: 0.35, depth: 1.20, jitter: 0.10, pointy: 0.90 },
};

function SettingsRail({ preset, setPreset, laser, setLaser, params, setParams, lines, setLines, photo, bgRemoved, setBgRemoved, onReset }) {
  useEffect(() => {
    const p = PRESET_PARAMS[preset];
    if (p) setParams(prev => ({ ...prev, ...p }));
  }, [preset]);

  const sp = (k, v) => setParams(p => ({ ...p, [k]: v }));

  return (
    <aside className="rail">
      <div className="rail-top">
        <span className="rail-title">Settings</span>
        {photo && <button className="rail-reset" onClick={onReset}>Reset ↺</button>}
      </div>

      <div className="rail-sec">
        <Dropdown label="Photo type" value={preset} onChange={setPreset} options={[
          { k: "portrait",  label: "Portrait",    desc: "Face-aware depth enhancement",  meta: "~1.2M pts" },
          { k: "pet",       label: "Pet",          desc: "Detail for fur & eyes",          meta: "~1.5M pts" },
          { k: "landscape", label: "Landscape",    desc: "Horizon-weighted depth",         meta: "~1.8M pts" },
          { k: "object",    label: "Object",       desc: "Sharp edges & hard surfaces",    meta: "~900k pts" },
          { k: "logo",      label: "Logo / Text",  desc: "Crisp silhouette output",        meta: "~600k pts" },
        ]} />
        <Dropdown label="Laser machine" value={laser} onChange={setLaser} options={[
          { k: "xtool",     label: "xTool F1 Ultra",  desc: "Exports as GLB · 50×50×80 mm",   meta: "GLB" },
          { k: "haotian",   label: "Haotian X1",      desc: "Exports as STL · 60×60×90 mm",   meta: "STL" },
          { k: "commarker", label: "Commarker B4",     desc: "Exports as STL · 40×40×60 mm",   meta: "STL" },
          { k: "rocksolid", label: "Rock Solid C9",    desc: "Exports as DXF · 50×50×100 mm",  meta: "DXF" },
          { k: "custom",    label: "Custom",           desc: "Choose your format manually",    meta: "any" },
        ]} />
        <Slider label="Point density" value={params.density} set={v => sp("density", v)}
          hint="More points = sharper result, longer engraving time"
          display={v => fmtPts(300000 + v * 2200000)} />
      </div>

      <Collapse title="More settings">
        <Slider label="3D depth" value={params.depth} set={v => sp("depth", v)} min={0.4} max={1.3}
          hint="How strong the 3D effect appears in the crystal" />
        <Slider label="Point scatter" value={params.jitter} set={v => sp("jitter", v)}
          hint="Adds organic variation — reduces mechanical-looking patterns" />
        <Slider label="Sharpness" value={params.pointy} set={v => sp("pointy", v)}
          hint="How crisp each individual engraved point looks" />

        <div className="sub-label">Image adjustments</div>
        <Slider label="Brightness" value={params.brightness} set={v => sp("brightness", v)} min={-0.5} max={0.5} />
        <Slider label="Contrast"   value={params.contrast}   set={v => sp("contrast",   v)} min={0.5} max={1.5} />
        <Slider label="Gamma"      value={params.gamma}      set={v => sp("gamma",      v)} min={0.5} max={2.0} />

        <div className="sub-label">Crystal dimensions</div>
        <Slider label="Z layers" value={params.zlayers} set={v => sp("zlayers", v)}
          min={20} max={120} step={1} display={v => Math.round(v) + " layers"}
          hint="More layers = smoother depth transitions" />
        <div className="mini-row">
          <Slider label="Margin X" value={params.marginX} set={v => sp("marginX", v)} min={0} max={10} step={0.1} display={v => v.toFixed(1) + " mm"} />
          <Slider label="Margin Y" value={params.marginY} set={v => sp("marginY", v)} min={0} max={10} step={0.1} display={v => v.toFixed(1) + " mm"} />
        </div>

        <div className="sub-label">Options</div>
        <div className="toggles">
          <Toggle label="Auto-rotate preview"  value={params.auto}   set={v => sp("auto",   v)} />
          <Toggle label="Background removed"   value={bgRemoved}     set={setBgRemoved} />
          <Toggle label="Invert depth"         value={params.invert} set={v => sp("invert", v)} />
        </div>
      </Collapse>

      <Collapse title="Add text to the crystal">
        <div className="text-lines">
          {[0, 1, 2].map(i => (
            <input key={i} className="text-line" placeholder={`Line ${i + 1} (optional)`} maxLength={32}
              value={lines[i] || ""} onChange={e => { const n = [...lines]; n[i] = e.target.value; setLines(n); }} />
          ))}
        </div>
      </Collapse>
    </aside>
  );
}

// ---- Preview panes ----
function CornerTicks() {
  return <>
    <span className="tick tl" /><span className="tick tr" />
    <span className="tick bl" /><span className="tick br" />
  </>;
}

function UploadZone({ onLoad }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const handle = file => { if (!file) return; onLoad({ name: file.name, size: file.size }); };
  return (
    <div className={`uz${drag ? " drag" : ""}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}>
      <div className="uz-inner">
        <svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="0.9">
          <rect x="4" y="4" width="56" height="56" rx="3" strokeDasharray="2.5 3" />
          <path d="M22 40 L32 28 L42 40" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="32" y1="28" x2="32" y2="48" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <div className="uz-title">Drop a photo</div>
        <div className="t-mono" style={{ fontSize: 10, opacity: 0.4 }}>JPG · PNG · BMP · up to 32 MP</div>
        <div className="uz-actions">
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>Browse files</button>
          <button className="btn uz-ghost-btn"
            onClick={() => handle({ name: "sample_portrait.jpg", size: 2_400_000 })}>Use sample</button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => handle(e.target.files?.[0])} />
      </div>
    </div>
  );
}

function PhotoPlaceholder({ bgRemoved }) {
  return (
    <svg viewBox="0 0 240 300" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="ph-str" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
        </pattern>
        <radialGradient id="ph-vg" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor={bgRemoved ? "#181818" : "#2e2820"} />
          <stop offset="100%" stopColor="#040404" />
        </radialGradient>
      </defs>
      <rect width="240" height="300" fill="url(#ph-vg)" />
      <rect width="240" height="300" fill="url(#ph-str)" />
      <text x="120" y="148" textAnchor="middle" fontFamily="JetBrains Mono,monospace" fontSize="9.5"
        fill="rgba(255,255,255,0.2)" letterSpacing="1.2">portrait.jpg</text>
      <text x="120" y="164" textAnchor="middle" fontFamily="JetBrains Mono,monospace" fontSize="8"
        fill="rgba(255,255,255,0.1)" letterSpacing="0.5">{bgRemoved ? "background · removed" : "background · original"}</text>
    </svg>
  );
}

function DepthPlaceholder() {
  return (
    <svg viewBox="0 0 240 300" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="dp-g" cx="50%" cy="42%" r="48%">
          <stop offset="0%" stopColor="#f8fff8" stopOpacity="0.85" />
          <stop offset="35%" stopColor="#5aaa70" stopOpacity="0.65" />
          <stop offset="70%" stopColor="#183028" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#000" stopOpacity="1" />
        </radialGradient>
      </defs>
      <rect width="240" height="300" fill="#000" />
      <ellipse cx="120" cy="138" rx="82" ry="96" fill="url(#dp-g)" />
      <text x="120" y="265" textAnchor="middle" fontFamily="JetBrains Mono,monospace" fontSize="9"
        fill="rgba(255,255,255,0.18)" letterSpacing="1.2">depth · map</text>
    </svg>
  );
}

function PhotoView({ bgRemoved }) {
  return (
    <div className="src-view">
      <div className="src-frame">
        <PhotoPlaceholder bgRemoved={bgRemoved} />
        <CornerTicks />
      </div>
    </div>
  );
}

function DepthView() {
  return (
    <div className="src-view">
      <div className="src-frame">
        <DepthPlaceholder />
        <CornerTicks />
      </div>
      <div className="depth-scale">
        <span className="t-mono t-muted">near</span>
        <div className="scale-bar" />
        <span className="t-mono t-muted">far</span>
      </div>
    </div>
  );
}

function ProcessingOverlay({ progress }) {
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
        <div className="t-mono t-muted" style={{ fontSize: 10 }}>depth-anything-v2 · mps</div>
        <div className="proc-pct t-mono">
          {Math.round(progress)}<span className="proc-unit">%</span>
        </div>
        <div className="proc-bar"><div className="proc-fill" style={{ width: `${progress}%` }} /></div>
        <div className="proc-steps">
          {steps.map((s, i) => {
            const done = progress >= s.to;
            const active = !done && progress >= (i === 0 ? 0 : steps[i - 1].to);
            return (
              <div key={s.k} className={`proc-step${done ? " done" : ""}${active ? " active" : ""}`}>
                <span className="proc-dot" /><span className="t-mono">{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }) {
  return (
    <div className="stat">
      <span className="t-mono t-muted">{k}</span>
      <span className="t-mono">{v}</span>
    </div>
  );
}

function Preview({ state, params, lines, accent, photo, bgRemoved, procProgress, onLoad, onReset }) {
  const [srcView, setSrcView] = useState("photo");
  const pts = fmtPts(300000 + params.density * 2200000);
  const ready = state === "ready";
  const fname = photo?.name?.replace(/\.[^.]+$/, "") || "subject_01";

  return (
    <div className="preview">
      {/* Source pane */}
      <div className="pane">
        <div className="pane-chrome">
          <div className="chrome-l">
            <div className="chrome-dots"><i /><i /><i /></div>
            <span className="t-mono t-muted" style={{ fontSize: 10 }}>source</span>
          </div>
          {photo ? (
            <div className="view-tabs">
              <button className={srcView === "photo" ? "on" : ""} onClick={() => setSrcView("photo")}>Photo</button>
              <button className={srcView === "depth" ? "on" : ""} onClick={() => setSrcView("depth")}>Depth</button>
            </div>
          ) : (
            <span className="t-mono t-muted" style={{ fontSize: 10 }}>step 1 · upload</span>
          )}
        </div>
        <div className="pane-body">
          {!photo
            ? <UploadZone onLoad={onLoad} />
            : srcView === "photo"
              ? <PhotoView bgRemoved={bgRemoved} />
              : <DepthView />
          }
        </div>
        {photo && (
          <div className="pane-foot">
            <div className="stat-grp">
              <Stat k="file" v={photo.name} />
              <Stat k="status" v={state === "processing" ? "processing…" : "ready"} />
            </div>
            <button className="rail-reset t-mono" onClick={onReset}>reset ↺</button>
          </div>
        )}
      </div>

      {/* Cloud pane */}
      <div className="pane">
        <div className="pane-chrome">
          <div className="chrome-l">
            <div className="chrome-dots"><i /><i /><i /></div>
            <span className="t-mono t-muted" style={{ fontSize: 10 }}>
              {ready ? `~/jobs/${fname}` : "point cloud preview"}
            </span>
          </div>
          <span className="t-mono t-muted" style={{ fontSize: 10 }}>
            {ready ? "drag · rotate · scroll" : !photo ? "awaiting photo" : "processing…"}
          </span>
        </div>
        <div className="pane-body">
          {/* Canvas */}
          <div style={{ position: "absolute", inset: 0 }}>
            <PointCloudCanvas
              density={ready ? params.density : 0.18}
              depth={ready ? params.depth : 1.0}
              jitter={ready ? params.jitter : 0.15}
              pointy={ready ? params.pointy : 0.5}
              rotationSpeed={ready ? (params.auto ? 0.28 : 0) : 0.14}
              placeholder={!ready}
              accent={accent}
            />
          </div>
          {/* Overlay */}
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
                    {lines.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ol ol-tl t-muted" style={{ opacity: 0.3 }}>preview · empty</div>
                <div className="ol ol-tr t-muted" style={{ opacity: 0.3 }}>awaiting source</div>
                <div className="cloud-hint">
                  <div className="cloud-hint-title">Your point cloud renders here.</div>
                  <div className="t-mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                    drop a photo on the left to begin
                  </div>
                </div>
              </>
            )}
          </div>
          {state === "processing" && <ProcessingOverlay progress={procProgress} />}
        </div>
      </div>
    </div>
  );
}

// ---- Export bar ----
function ExportBar({ signedIn, plan, credits, setCredits, onCheckout, hasPhoto, selectedFormats, setSelectedFormats }) {
  const formats = ["STL", "GLB", "DXF", "PLY", "XYZ"];
  const select = k => setSelectedFormats(new Set([k]));
  const subOk = signedIn && plan && plan !== "free";
  const disabled = !hasPhoto || selectedFormats.size === 0;

  const doExport = () => {
    if (subOk) {
      if (plan !== "max" && credits > 0) setCredits(c => c - 1);
      onCheckout({ mode: "sub-used", plan, formats: [...selectedFormats] });
    } else {
      onCheckout({ mode: "payg", name: "Single export", price: "€1.99", blurb: "One photo · all formats · 30-day re-exports.", formats: [...selectedFormats] });
    }
  };

  return (
    <div className="export-bar">
      <div className="eb-left">
        <span className="t-mono t-muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          output formats
        </span>
        <div className="fmt-chips">
          {formats.map(f => (
            <button key={f} className={`fmt-chip${selectedFormats.has(f) ? " on" : ""}`} onClick={() => select(f)}>
              <span className="t-mono">{f}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="eb-right">
        <div className="eb-price">
          {subOk ? (
            <>
              <div className="t-mono t-muted" style={{ fontSize: 10 }}>cost</div>
              <div className="eb-amt">{plan === "max" ? "included" : "1 credit"}</div>
            </>
          ) : (
            <>
              <div className="t-mono t-muted" style={{ fontSize: 10 }}>you pay</div>
              <div className="eb-amt">€1.99</div>
            </>
          )}
        </div>
        <button className="btn btn-primary btn-lg" disabled={disabled} onClick={doExport}>
          {subOk ? "Export →" : "Pay & export →"}
        </button>
      </div>
    </div>
  );
}

// ---- Checkout modal ----
function CheckoutModal({ checkout, onClose, onComplete }) {
  const [stage, setStage] = useState("form");
  useEffect(() => { setStage("form"); }, [checkout]);
  useEffect(() => {
    if (stage === "processing") {
      const t = setTimeout(() => setStage("done"), 1200);
      return () => clearTimeout(t);
    }
  }, [stage]);
  if (!checkout) return null;

  if (checkout.mode === "sub-used") {
    return (
      <div className="overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <span className="t-mono" style={{ fontSize: 12 }}>exporting · {checkout.plan}</span>
            <button className="icon-btn" onClick={onClose}>✕</button>
          </div>
          <div className="co-done">
            <div className="done-tick">✓</div>
            <div className="done-title">Exporting {checkout.formats.length} format{checkout.formats.length > 1 ? "s" : ""}.</div>
            <div className="t-mono t-muted" style={{ fontSize: 11 }}>{checkout.formats.join(" · ")}</div>
            <div className="fake-dls">
              {checkout.formats.map(f => (
                <div key={f} className="fake-dl">
                  <span className="t-mono" style={{ fontSize: 11 }}>subject_01.{f.toLowerCase()}</span>
                  <span className="t-mono t-muted" style={{ fontSize: 11 }}>↓</span>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-block" onClick={onClose}>Back to studio</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="t-mono" style={{ fontSize: 12 }}>checkout · {(checkout.name || "single").toLowerCase()}</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {stage === "form" && (
          <div className="co-form">
            <div className="co-summary">
              <div className="t-mono t-muted" style={{ fontSize: 10 }}>you're paying</div>
              <div className="co-amt-row">
                <span className="co-price">{checkout.price}</span>
                {checkout.unit && <span className="t-mono t-muted">{checkout.unit}</span>}
              </div>
              <div className="t-muted" style={{ fontSize: 12 }}>{checkout.blurb}</div>
            </div>
            <div className="co-field"><label>email</label><input defaultValue="you@shop.co" /></div>
            <div className="co-field"><label>card</label><input defaultValue="4242 4242 4242 4242" /></div>
            <div className="co-field-row">
              <div className="co-field"><label>exp</label><input defaultValue="04 / 28" /></div>
              <div className="co-field"><label>cvc</label><input defaultValue="424" /></div>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => setStage("processing")}>
              Pay {checkout.price}
            </button>
            <div className="t-mono t-muted" style={{ fontSize: 10, textAlign: "center" }}>mock checkout · no charge</div>
          </div>
        )}
        {stage === "processing" && (
          <div className="co-proc"><div className="spinner" /><div className="t-mono t-muted" style={{ fontSize: 11 }}>authorising…</div></div>
        )}
        {stage === "done" && (
          <div className="co-done">
            <div className="done-tick">✓</div>
            <div className="done-title">Paid.</div>
            <div className="t-mono t-muted" style={{ fontSize: 11 }}>{checkout.name} · {checkout.price}{checkout.unit || ""}</div>
            <button className="btn btn-primary btn-block" onClick={() => { onComplete(checkout); onClose(); }}>
              {checkout.mode === "sub" ? "Start using " + checkout.name : "Download files →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Auth modal ----
function AuthModal({ open, onClose, onSignIn }) {
  if (!open) return null;
  const isUp = open === "up";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="t-mono" style={{ fontSize: 12 }}>{isUp ? "sign up" : "sign in"}</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="co-form">
          <button className="btn btn-ghost btn-block" style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.37-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div className="t-mono t-muted" style={{ fontSize: 11, textAlign: "center" }}>or · email</div>
          <div className="co-field"><label>email</label><input defaultValue="you@shop.co" /></div>
          <div className="co-field"><label>password</label><input type="password" defaultValue="••••••••" /></div>
          <button className="btn btn-primary btn-block" onClick={() => { onSignIn(); onClose(); }}>
            {isUp ? "Create account →" : "Sign in →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Tweaks panel ----
function TweaksPanel({ active, accent, setAccent, theme, setTheme }) {
  if (!active) return null;
  const accents = [
    { name: "amber",   v: "rgb(218,128,44)" },
    { name: "crystal", v: "rgb(200,235,255)" },
    { name: "green",   v: "rgb(148,255,168)" },
    { name: "rose",    v: "rgb(240,140,175)" },
    { name: "pearl",   v: "rgb(235,230,220)" },
  ];
  return (
    <div className="tweaks">
      <div className="tweaks-head">Tweaks</div>
      <div className="tweak-row">
        <div className="t-mono t-muted" style={{ fontSize: 10 }}>accent</div>
        <div className="swatches">
          {accents.map(a => (
            <button key={a.name} className={`swatch${accent === a.v ? " on" : ""}`}
              style={{ background: a.v }} onClick={() => setAccent(a.v)} title={a.name} />
          ))}
        </div>
      </div>
      <div className="tweak-row">
        <div className="t-mono t-muted" style={{ fontSize: 10 }}>theme</div>
        <div style={{ display: "flex", gap: 5 }}>
          {["light", "dark"].map(t => (
            <button key={t} className={`btn btn-ghost${theme === t ? " active" : ""}`}
              style={{ padding: "4px 10px", fontSize: 10, fontFamily: "JetBrains Mono,monospace" }}
              onClick={() => setTheme(t)}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  TopBar, SettingsRail, Preview, ExportBar,
  CheckoutModal, AuthModal, TweaksPanel, Wordmark,
});
