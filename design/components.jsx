// pointcloud3d — compact studio

const { useState, useEffect, useRef, useMemo } = React;

function formatPts(n) {
  const v = Math.round(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 2) + "M pts";
  if (v >= 1_000) return Math.round(v / 1_000).toLocaleString() + "k pts";
  return v.toLocaleString() + " pts";
}

function Wordmark({ size = 15 }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <span className="wm-dim">point</span><span className="wm-dot">·</span>
      <span className="wm-dim">cloud</span><span className="wm-dot">·</span>
      <span className="wm-bright">3d</span>
    </span>
  );
}

function Nav({ theme, setTheme, signedIn, setSignedIn, credits, plan, onNav, active, onAuth }) {
  return (
    <header className="nav">
      <div className="nav-inner">
        <a href="#" className="nav-brand" onClick={(e) => { e.preventDefault(); onNav("studio"); }}>
          <Wordmark size={14} />
        </a>
        <nav className="nav-links">
          <button className={active === "studio" ? "on" : ""} onClick={() => onNav("studio")}>Studio</button>
          <button className={active === "guide" ? "on" : ""} onClick={() => onNav("guide")}>Guide</button>
          <button className={active === "pricing" ? "on" : ""} onClick={() => onNav("pricing")}>Pricing</button>
        </nav>
        <div className="nav-right">
          <button className="icon-btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">
            {theme === "dark"
              ? <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><circle cx="8" cy="8" r="3.2"/><g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="8" y1="1.5" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="14.5"/><line x1="1.5" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="14.5" y2="8"/><line x1="3" y1="3" x2="4" y2="4"/><line x1="12" y1="12" x2="13" y2="13"/><line x1="3" y1="13" x2="4" y2="12"/><line x1="12" y1="4" x2="13" y2="3"/></g></svg>
              : <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M11.5 10.5A5.5 5.5 0 0 1 5.5 4.5a5.5 5.5 0 1 0 6 6z"/></svg>}
          </button>
          {signedIn ? (
            <>
              <div className="credit-chip">
                <span className="mono muted">{plan || "credits"}</span>
                <span className="mono credit-val">{plan === "max" ? "∞" : credits}</span>
              </div>
              <button className="avatar" onClick={() => setSignedIn(false)} title="Sign out">JM</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={() => onAuth("in")}>Sign in</button>
              <button className="btn btn-primary" onClick={() => onAuth("up")}>Sign up</button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// Compact dropdown
function Dropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = options.find((o) => o.k === value);
  return (
    <div className="dd" ref={ref}>
      <button className={`dd-btn ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
        <span className="dd-label mono">{label}</span>
        <span className="dd-val">
          <span>{current?.label}</span>
          <span className="mono muted dd-meta">{current?.meta}</span>
        </span>
        <svg className="dd-caret" viewBox="0 0 10 10" width="10" height="10"><path d="M2 4 L5 7 L8 4" fill="none" stroke="currentColor" strokeWidth="1.2"/></svg>
      </button>
      {open && (
        <div className="dd-menu">
          {options.map((o) => (
            <button key={o.k} className={`dd-item ${value === o.k ? "on" : ""}`} onClick={() => { onChange(o.k); setOpen(false); }}>
              <span className="dd-dot" />
              <span className="dd-item-body">
                <span>{o.label}</span>
                {o.desc && <span className="mono muted dd-item-desc">{o.desc}</span>}
              </span>
              <span className="mono muted">{o.meta}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Slider({ label, value, set, min = 0, max = 1, step = 0.01, display }) {
  const pct = ((value - min) / (max - min)) * 100;
  const disp = display ? display(value) : value.toFixed(2);
  return (
    <div className="slider">
      <div className="slider-head">
        <span className="s-label mono">{label}</span>
        <span className="s-val mono">{disp}</span>
      </div>
      <div className="slider-track">
        <div className="slider-fill" style={{ width: `${pct}%` }} />
        <div className="slider-thumb" style={{ left: `${pct}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(parseFloat(e.target.value))} />
      </div>
    </div>
  );
}

function Toggle({ label, value, set }) {
  return (
    <label className={`toggle ${value ? "on" : ""}`} onClick={() => set(!value)}>
      <span className="t-track"><span className="t-knob" /></span>
      <span className="mono">{label}</span>
    </label>
  );
}

function Collapse({ title, children, startOpen }) {
  const [open, setOpen] = useState(!!startOpen);
  return (
    <div className={`collapse ${open ? "open" : ""}`}>
      <button className="collapse-head" onClick={() => setOpen(!open)}>
        <span className="mono c-title">{title}</span>
        <span className="mono muted">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </div>
  );
}

// ---------- Settings rail ----------
function SettingsRail({ preset, setPreset, laser, setLaser, params, setParams, lines, setLines, photo, bgRemoved, setBgRemoved, onReset }) {
  return (
    <aside className="rail">
      <div className="rail-head">
        <div className="mono muted small">settings</div>
        {photo && <button className="rail-reset mono" onClick={onReset}>reset ↺</button>}
      </div>

      <Dropdown
        label="preset"
        value={preset}
        onChange={setPreset}
        options={[
          { k: "portrait", label: "Portrait", desc: "Face-aware depth", meta: "~1.2M" },
          { k: "pet", label: "Pet", desc: "Fur + eye detail", meta: "~1.5M" },
          { k: "landscape", label: "Landscape", desc: "Horizon-weighted", meta: "~1.8M" },
          { k: "object", label: "Object", desc: "Hard edges", meta: "~900k" },
          { k: "logo", label: "Logo / Text", desc: "Crisp silhouette", meta: "~600k" },
        ]}
      />

      <Dropdown
        label="laser"
        value={laser}
        onChange={setLaser}
        options={[
          { k: "xtool", label: "xTool F1 Ultra", desc: "GLB · 50×50×80", meta: "GLB" },
          { k: "haotian", label: "Haotian X1", desc: "STL · 60×60×90", meta: "STL" },
          { k: "commarker", label: "Commarker B4", desc: "STL · 40×40×60", meta: "STL" },
          { k: "rocksolid", label: "Rock Solid C9", desc: "DXF · 50×50×100", meta: "DXF" },
          { k: "custom", label: "Custom", desc: "Set size below", meta: "any" },
        ]}
      />

      <div className="rail-section">
        <Slider label="density" value={params.density} set={(v) => setParams({ ...params, density: v })} display={(v) => formatPts(300000 + v * 2200000)} />
        <Slider label="depth"   value={params.depth}   set={(v) => setParams({ ...params, depth: v })} min={0.4} max={1.3} />
        <Slider label="jitter"  value={params.jitter}  set={(v) => setParams({ ...params, jitter: v })} />
        <Slider label="point"   value={params.pointy}  set={(v) => setParams({ ...params, pointy: v })} />
      </div>

      <Collapse title="advanced">
        <Slider label="brightness" value={params.brightness} set={(v) => setParams({ ...params, brightness: v })} min={-0.5} max={0.5} />
        <Slider label="contrast"   value={params.contrast}   set={(v) => setParams({ ...params, contrast: v })} min={0.5} max={1.5} />
        <Slider label="gamma"      value={params.gamma}      set={(v) => setParams({ ...params, gamma: v })} min={0.5} max={2} />
        <Slider label="z·layers"   value={params.zlayers}    set={(v) => setParams({ ...params, zlayers: v })} min={20} max={120} step={1} display={(v) => Math.round(v).toString()} />
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
            <input key={i} className="text-line" placeholder={`Line ${i + 1}`} maxLength={32} value={lines[i] || ""} onChange={(e) => { const n = [...lines]; n[i] = e.target.value; setLines(n); }} />
          ))}
        </div>
      </Collapse>
    </aside>
  );
}

// ---------- Preview (split: source on left, cloud on right) ----------
function Preview({ state, params, lines, accent, photo, bgRemoved, procProgress, onLoad, onReset }) {
  const [sourceView, setSourceView] = useState("photo");
  const pts = formatPts(300000 + params.density * 2200000);
  const ready = state === "ready";

  return (
    <section className="preview split">
      {/* LEFT PANE — source / upload */}
      <div className="pane pane-source">
        <div className="pv-chrome">
          <div className="pv-chrome-l">
            <div className="chrome-dots"><i/><i/><i/></div>
            <div className="mono muted">source</div>
          </div>
          {photo ? (
            <div className="view-tabs">
              <button className={sourceView === "photo" ? "on" : ""} onClick={() => setSourceView("photo")}>Photo</button>
              <button className={sourceView === "depth" ? "on" : ""} onClick={() => setSourceView("depth")}>Depth</button>
            </div>
          ) : <div className="mono muted small">step 1 · upload</div>}
        </div>
        <div className="pv-body">
          {!photo ? (
            <UploadZone onLoad={onLoad} />
          ) : (
            <>
              {sourceView === "photo" && <PhotoView bgRemoved={bgRemoved} />}
              {sourceView === "depth" && <DepthView />}
            </>
          )}
        </div>
        {photo && (
          <div className="pv-foot">
            <div className="stat-group">
              <Stat k="file" v={photo.name || "portrait.jpg"} />
              <Stat k="status" v={state === "processing" ? "processing" : "ready"} />
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANE — point cloud preview */}
      <div className="pane pane-cloud">
        <div className="pv-chrome">
          <div className="pv-chrome-l">
            <div className="chrome-dots"><i/><i/><i/></div>
            <div className="mono muted">{ready ? `~/jobs/${photo?.name?.replace(/\.[^.]+$/, "") || "new"}` : "preview"}</div>
          </div>
          <div className="pv-chrome-r mono muted">{ready ? "drag · rotate" : !photo ? "awaiting photo" : "processing…"}</div>
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
              accent={accent}
            />
            <div className="cloud-overlay">
              <CornerTicks />
              {ready ? (
                <>
                  <div className="overlay-label mono top-left" style={{ color: "var(--accent)" }}>{(photo?.name || "SUBJECT_01").toUpperCase()}.ply</div>
                  <div className="overlay-label mono top-right">{pts} pts</div>
                  <div className="overlay-label mono bottom-left">50 × 50 × 80 mm</div>
                  <div className="overlay-label mono bottom-right">+x →</div>
                  {lines.filter(Boolean).length > 0 && (
                    <div className="cloud-text">{lines.filter(Boolean).map((l, i) => <div key={i}>{l}</div>)}</div>
                  )}
                </>
              ) : (
                <>
                  <div className="overlay-label mono top-left muted">preview · empty</div>
                  <div className="overlay-label mono top-right muted">awaiting source</div>
                  <div className="overlay-label mono bottom-left muted">50 × 50 × 80 mm</div>
                  <div className="overlay-label mono bottom-right muted">+x →</div>
                  <div className="cloud-hint">
                    <div className="cloud-hint-title">Your point cloud renders here.</div>
                    <div className="mono muted small">drop a photo on the left to begin</div>
                  </div>
                </>
              )}
            </div>
            {state === "processing" && <ProcessingOverlay progress={procProgress} />}
          </div>
        </div>
        <div className="pv-foot">
          <div className="stat-group">
            <Stat k="pts" v={ready ? pts : "—"} />
            <Stat k="size" v="50×50×80 mm" />
            <Stat k="depth" v={`${params.depth.toFixed(2)} z·scale`} />
            <Stat k="engine" v="depth-anything v2" hide="sm" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ k, v, hide }) {
  return <div className={`stat ${hide ? "hide-" + hide : ""}`}><span className="mono muted">{k}</span><span className="mono">{v}</span></div>;
}

function CornerTicks() {
  return <><span className="tick tl"/><span className="tick tr"/><span className="tick bl"/><span className="tick br"/></>;
}

function UploadZone({ onLoad }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);
  const handle = (file) => { if (!file) return; onLoad({ name: file.name || "portrait.jpg", size: file.size || 2_400_000 }); };
  return (
    <div
      className={`uz ${drag ? "dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
    >
      <div className="uz-inner">
        <svg viewBox="0 0 80 80" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="0.8">
          <rect x="6" y="6" width="68" height="68" rx="2" strokeDasharray="2 3"/>
          <path d="M26 48 L40 34 L54 48" strokeWidth="1.2"/>
          <line x1="40" y1="34" x2="40" y2="58" strokeWidth="1.2"/>
        </svg>
        <div className="uz-title">Drop a photo</div>
        <div className="mono muted">JPG · PNG · BMP · up to 32 MP</div>
        <div className="uz-actions">
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>Browse</button>
          <button className="btn btn-ghost" onClick={() => handle({ name: "sample_portrait.jpg", size: 2_400_000 })}>Use sample</button>
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => handle(e.target.files?.[0])} />
      </div>
    </div>
  );
}

function ProcessingOverlay({ progress }) {
  const steps = [
    { k: "upload",  label: "Upload",     to: 15 },
    { k: "bgrm",    label: "BG remove",  to: 35 },
    { k: "depth",   label: "Depth",      to: 65 },
    { k: "face",    label: "Face pass",  to: 85 },
    { k: "cloud",   label: "Sample",     to: 100 },
  ];
  return (
    <div className="proc-overlay">
      <div className="proc-card">
        <div className="mono muted small">depth-anything v2 · mps</div>
        <div className="proc-big mono">{Math.round(progress)}<span className="unit">%</span></div>
        <div className="proc-bar"><div className="proc-fill" style={{ width: `${progress}%` }}/></div>
        <div className="proc-steps">
          {steps.map((s) => {
            const done = progress >= s.to;
            const active = progress < s.to && progress >= (s.k === "upload" ? 0 : steps[steps.findIndex(x=>x.k===s.k)-1]?.to || 0);
            return <div key={s.k} className={`proc-step ${done ? "done" : ""} ${active ? "active" : ""}`}><span className="proc-dot"/><span className="mono">{s.label}</span></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function PhotoView({ bgRemoved }) {
  return (
    <div className="photo-view">
      <div className="photo-frame">
        <SamplePortraitSVG bgRemoved={bgRemoved}/>
        <CornerTicks/>
      </div>
    </div>
  );
}
function DepthView() {
  return (
    <div className="photo-view">
      <div className="photo-frame">
        <DepthMapSVG/>
        <CornerTicks/>
      </div>
      <div className="depth-scale mono muted"><span>near</span><div className="scale-bar"/><span>far</span></div>
    </div>
  );
}

function SamplePortraitSVG({ bgRemoved }) {
  return (
    <svg viewBox="0 0 400 500" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="bg2" cx="50%" cy="40%" r="80%"><stop offset="0%" stopColor="#8a8577"/><stop offset="100%" stopColor="#2b2821"/></radialGradient>
        <radialGradient id="skin2" cx="50%" cy="45%" r="60%"><stop offset="0%" stopColor="#e8c8a8"/><stop offset="60%" stopColor="#b88860"/><stop offset="100%" stopColor="#4a3828"/></radialGradient>
        <radialGradient id="hair2" cx="50%" cy="30%" r="50%"><stop offset="0%" stopColor="#3a2820"/><stop offset="100%" stopColor="#100a08"/></radialGradient>
      </defs>
      <rect width="400" height="500" fill={bgRemoved ? "#000" : "url(#bg2)"}/>
      <path d="M 50 500 Q 100 380 200 380 Q 300 380 350 500 Z" fill="#1a1510"/>
      <rect x="170" y="320" width="60" height="80" fill="url(#skin2)"/>
      <ellipse cx="200" cy="180" rx="130" ry="140" fill="url(#hair2)"/>
      <ellipse cx="200" cy="210" rx="95" ry="115" fill="url(#skin2)"/>
      <path d="M 115 160 Q 150 90 210 95 Q 290 90 305 200 Q 285 130 210 135 Q 145 135 125 200 Z" fill="url(#hair2)" opacity="0.95"/>
      <ellipse cx="165" cy="200" rx="18" ry="8" fill="#3a2820" opacity="0.5"/>
      <ellipse cx="235" cy="200" rx="18" ry="8" fill="#3a2820" opacity="0.5"/>
      <ellipse cx="165" cy="205" rx="10" ry="4" fill="#1a0f08"/>
      <ellipse cx="235" cy="205" rx="10" ry="4" fill="#1a0f08"/>
      <path d="M 200 210 Q 195 250 198 265 Q 200 270 205 265 Q 210 260 205 245 Q 203 225 200 210 Z" fill="#a07858" opacity="0.5"/>
      <path d="M 175 290 Q 200 285 225 290 Q 220 298 200 297 Q 180 298 175 290 Z" fill="#8a4030"/>
    </svg>
  );
}
function DepthMapSVG() {
  return (
    <svg viewBox="0 0 400 500" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="df" cx="50%" cy="42%" r="30%"><stop offset="0%" stopColor="#f0fff0"/><stop offset="100%" stopColor="#304a38"/></radialGradient>
        <radialGradient id="dh" cx="50%" cy="35%" r="45%"><stop offset="0%" stopColor="#6a8a72"/><stop offset="100%" stopColor="#14201a"/></radialGradient>
        <radialGradient id="dn" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#ffffff"/><stop offset="100%" stopColor="transparent"/></radialGradient>
      </defs>
      <rect width="400" height="500" fill="#000"/>
      <ellipse cx="200" cy="180" rx="130" ry="140" fill="url(#dh)"/>
      <ellipse cx="200" cy="210" rx="95" ry="115" fill="url(#df)"/>
      <ellipse cx="200" cy="250" rx="14" ry="35" fill="url(#dn)"/>
      <ellipse cx="165" cy="200" rx="18" ry="10" fill="#102018"/>
      <ellipse cx="235" cy="200" rx="18" ry="10" fill="#102018"/>
      <path d="M 50 500 Q 100 380 200 380 Q 300 380 350 500 Z" fill="#1a2820"/>
    </svg>
  );
}

// ---------- Export bar ----------
function ExportBar({ signedIn, plan, credits, setCredits, onCheckout, hasPhoto, selectedFormats, setSelectedFormats }) {
  const formats = ["STL", "GLB", "DXF", "PLY", "XYZ"];
  const toggle = (k) => {
    const n = new Set(selectedFormats);
    n.has(k) ? n.delete(k) : n.add(k);
    setSelectedFormats(n);
  };
  const subOk = signedIn && plan && plan !== "free";
  const disabled = !hasPhoto || selectedFormats.size === 0;

  const doExport = () => {
    if (subOk) {
      if (plan !== "max" && credits > 0) setCredits(credits - 1);
      onCheckout({ mode: "sub-used", plan, formats: [...selectedFormats] });
    } else {
      onCheckout({ mode: "payg", name: "Single export", price: "€1.99", blurb: "One photo · all selected formats · 30-day re-exports.", formats: [...selectedFormats] });
    }
  };

  return (
    <div className="export-bar">
      <div className="eb-formats">
        <span className="mono muted">formats</span>
        {formats.map((f) => (
          <button key={f} className={`fmt-chip ${selectedFormats.has(f) ? "on" : ""}`} onClick={() => toggle(f)}>
            <span className="mono">{f}</span>
          </button>
        ))}
      </div>
      <div className="eb-right">
        <div className="eb-price">
          {subOk ? (
            <>
              <div className="mono muted small">cost</div>
              <div className="eb-big">{plan === "max" ? "included" : "1 credit"}</div>
            </>
          ) : (
            <>
              <div className="mono muted small">you pay</div>
              <div className="eb-big">€1.99</div>
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

// ---------- Guide ----------
function Guide() {
  const q = [
    { q: "How does this produce sharper clouds than photopoints3d?", a: "Depth Anything V2 is a much stronger model than the classical baselines most converters ship. We run a face-aware second pass so eyes, nose, and lips keep structure, and our density curve is tuned to where the laser actually creates fracture points in crystal — not uniform voxels." },
    { q: "Which laser works with this?", a: "Every common inner-crystal engraver: STL for RK-CAD / BSL, GLB for xTool Studio, DXF for green-laser pipelines, PLY / XYZ for anything custom. Pick your machine in the Laser dropdown and we auto-configure format + crystal size." },
    { q: "What happens to my photo?", a: "Uploaded over TLS to Cloudflare R2. Processed once on our GPU, then deleted after 30 days unless you're on a plan that keeps history. We never use your photos to train models." },
    { q: "What does '30-day re-export' include?", a: "For 30 days after purchase you can re-run the same photo with different parameters — swap presets, tweak depth, change formats — without paying again." },
  ];
  return (
    <section className="guide-section">
      <div className="section-head">
        <div className="ph-kicker mono">guide</div>
        <h2>How pointcloud3d works.</h2>
      </div>
      <div className="guide-grid">
        {q.map((item, i) => (
          <div className="guide-card" key={i}>
            <div className="gc-n mono">{String(i+1).padStart(2, "0")}</div>
            <div className="gc-q">{item.q}</div>
            <div className="gc-a">{item.a}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Pricing ----------
function Pricing({ onBuy, currentPlan }) {
  const payg = [
    { k: "single", name: "Single", price: "€1.99", blurb: "One photo · all formats.", bullets: ["All 5 export formats", "30-day re-exports", "Watermark-free"] },
    { k: "three", name: "3-pack", price: "€4.99", blurb: "Three photos · save 17%.", featured: true, bullets: ["3 × single export", "Shareable codes", "30-day re-exports"] },
  ];
  const subs = [
    { k: "basic", name: "Basic", price: "€9.99", unit: "/ mo", blurb: "30 exports · side-gigs.", bullets: ["30 exports / month", "Batch up to 5"] },
    { k: "pro", name: "Pro", price: "€14.99", unit: "/ mo", featured: true, blurb: "100 exports · shops.", bullets: ["100 exports / month", "Batch up to 20", "Priority queue"] },
    { k: "max", name: "Max", price: "€19.99", unit: "/ mo", blurb: "Unlimited · production.", bullets: ["Fair-use unlimited", "Batch up to 50", "API access (beta)"] },
  ];
  return (
    <section className="pricing-section">
      <div className="section-head">
        <div className="ph-kicker mono">pricing</div>
        <h2>Pay per photo. Or subscribe.</h2>
        <p className="section-sub">Every purchase includes 30-day re-exports. Subscribers get credits deducted automatically.</p>
      </div>
      <div className="price-block-label mono muted">→ pay as you go</div>
      <div className="price-grid two">
        {payg.map((p) => <PriceCard key={p.k} plan={{...p, mode: "payg"}} onClick={() => onBuy({ ...p, mode: "payg" })} />)}
      </div>
      <div className="price-block-label mono muted">→ subscriptions</div>
      <div className="price-grid three">
        {subs.map((p) => <PriceCard key={p.k} plan={{...p, mode: "sub"}} current={currentPlan === p.k} onClick={() => onBuy({ ...p, mode: "sub" })} />)}
      </div>
    </section>
  );
}
function PriceCard({ plan, onClick, current }) {
  return (
    <div className={`price-card ${plan.featured ? "featured" : ""} ${current ? "current" : ""}`}>
      {plan.featured && <div className="ribbon mono">popular</div>}
      {current && <div className="ribbon current-ribbon mono">current</div>}
      <div className="pc-name mono muted">{plan.name}</div>
      <div className="pc-amt"><span className="amt">{plan.price}</span>{plan.unit && <span className="unit mono">{plan.unit}</span>}</div>
      <div className="pc-blurb">{plan.blurb}</div>
      <ul className="pc-list">{plan.bullets.map((b) => <li key={b}><span className="tick-mark">✓</span>{b}</li>)}</ul>
      <button className={`btn ${plan.featured ? "btn-primary" : "btn-ghost"} btn-block`} onClick={onClick} disabled={current}>
        {current ? "Current plan" : plan.mode === "sub" ? "Subscribe →" : "Buy →"}
      </button>
    </div>
  );
}

// ---------- Checkout + Auth ----------
function CheckoutModal({ checkout, onClose, onComplete }) {
  const [stage, setStage] = useState("form");
  useEffect(() => { setStage("form"); }, [checkout]);
  useEffect(() => {
    if (stage === "processing") { const t = setTimeout(() => setStage("done"), 1200); return () => clearTimeout(t); }
  }, [stage]);
  if (!checkout) return null;

  if (checkout.mode === "sub-used") {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head"><div className="mono">exporting · {checkout.plan}</div><button className="icon-btn" onClick={onClose}>✕</button></div>
          <div className="checkout-done">
            <div className="done-tick">✓</div>
            <div className="done-title">Exporting {checkout.formats.length} file{checkout.formats.length > 1 ? "s" : ""}.</div>
            <div className="mono muted small">{checkout.formats.join(" · ")}</div>
            <div className="mono muted small">{checkout.plan === "max" ? "included in Max" : "1 credit used"}</div>
            <div className="fake-downloads">
              {checkout.formats.map((f) => <div key={f} className="fake-dl"><span className="mono">subject_01.{f.toLowerCase()}</span><span className="mono muted">↓</span></div>)}
            </div>
            <button className="btn btn-primary btn-block" onClick={onClose}>Back to studio</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><div className="mono">checkout · {(checkout.name || "single").toLowerCase()}</div><button className="icon-btn" onClick={onClose}>✕</button></div>
        {stage === "form" && (
          <div className="checkout">
            <div className="co-summary">
              <div className="mono muted small">you're paying</div>
              <div className="co-amt"><span className="amt">{checkout.price}</span>{checkout.unit && <span className="unit mono">{checkout.unit}</span>}</div>
              <div className="mono muted small">{checkout.blurb}</div>
            </div>
            <div className="co-field"><label className="mono">email</label><input defaultValue="you@shop.co"/></div>
            <div className="co-field"><label className="mono">card</label><input defaultValue="4242 4242 4242 4242"/></div>
            <div className="co-field-row">
              <div className="co-field"><label className="mono">exp</label><input defaultValue="04 / 28"/></div>
              <div className="co-field"><label className="mono">cvc</label><input defaultValue="424"/></div>
            </div>
            <button className="btn btn-primary btn-block" onClick={() => setStage("processing")}>Pay {checkout.price}</button>
            <div className="mono muted small center">mock checkout · no charge</div>
          </div>
        )}
        {stage === "processing" && <div className="checkout-proc"><div className="spinner"/><div className="mono muted">authorising…</div></div>}
        {stage === "done" && (
          <div className="checkout-done">
            <div className="done-tick">✓</div>
            <div className="done-title">Paid.</div>
            <div className="mono muted small">{checkout.name} · {checkout.price}{checkout.unit || ""}</div>
            <button className="btn btn-primary btn-block" onClick={() => { onComplete(checkout); onClose(); }}>
              {checkout.mode === "sub" ? "Start using " + checkout.name : "Download files"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AuthModal({ open, onClose, onSignIn }) {
  const [mode, setMode] = useState("in");
  useEffect(() => { if (open) setMode(open); }, [open]);
  if (!open) return null;
  const isUp = open === "up";
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><div className="mono">{isUp ? "sign up" : "sign in"}</div><button className="icon-btn" onClick={onClose}>✕</button></div>
        <div className="checkout">
          <button className="btn btn-ghost btn-block oauth"><GoogleGlyph/> Continue with Google</button>
          <div className="auth-or mono muted">or · email</div>
          <div className="co-field"><label className="mono">email</label><input defaultValue="you@shop.co"/></div>
          <div className="co-field"><label className="mono">password</label><input type="password" defaultValue="••••••••"/></div>
          <button className="btn btn-primary btn-block" onClick={() => { onSignIn(); onClose(); }}>{isUp ? "Create account" : "Sign in"}</button>
        </div>
      </div>
    </div>
  );
}
function GoogleGlyph() {
  return <svg viewBox="0 0 24 24" width="16" height="16"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.37-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>;
}

function TweaksPanel({ active, accent, setAccent }) {
  if (!active) return null;
  const accents = [
    { name: "laser-green", v: "rgb(148 255 168)" },
    { name: "ice-blue", v: "rgb(140 210 255)" },
    { name: "amber", v: "rgb(255 190 100)" },
    { name: "magenta", v: "rgb(240 130 210)" },
  ];
  return (
    <div className="tweaks">
      <div className="tweaks-head mono">tweaks</div>
      <div className="tweak-row">
        <div className="mono muted small">accent</div>
        <div className="swatches">{accents.map((a) => <button key={a.name} className={`swatch ${accent === a.v ? "on" : ""}`} style={{ background: a.v }} onClick={() => setAccent(a.v)} title={a.name}/>)}</div>
      </div>
    </div>
  );
}

Object.assign(window, { Nav, SettingsRail, Preview, ExportBar, Guide, Pricing, CheckoutModal, AuthModal, TweaksPanel, Wordmark });
