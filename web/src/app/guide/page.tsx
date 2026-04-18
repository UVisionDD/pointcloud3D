import Link from "next/link";

import { NavBar } from "@/components/navbar";

const QA = [
  {
    n: "01",
    q: "What is an inner-crystal point cloud?",
    a: "Fibre lasers create tiny fractures inside a crystal — each fracture is one point in the cloud. Brighter pixels in the source photo mean denser fractures, so the portrait appears as floating light inside glass.",
  },
  {
    n: "02",
    q: "What should I upload?",
    a: "Well-lit, in-focus portraits work best. A plain or clean background helps. The foreground subject will receive most of the depth detail, so skip cluttered scenes.",
  },
  {
    n: "03",
    q: "Which preset do I pick?",
    a: "Portrait for people, Pet for animals with fur, Landscape for scenes with deep Z range, Object for single products, Logo/Text for crisp silhouettes. Presets only change starting parameters — fine-tune anything after.",
  },
  {
    n: "04",
    q: "How many points will the cloud have?",
    a: "Between roughly 500k and 2M points depending on preset and density. That's typical for commercial crystal engravers — enough detail for portraits, not so many that the fibre laser slows to a crawl.",
  },
  {
    n: "05",
    q: "Which file format does my laser need?",
    a: "xTool F1 Ultra reads GLB. Haotian, Commarker, Rock Solid expect STL. Green / DPSS lasers usually take DXF. Every export ships all five — STL, GLB, DXF, PLY, XYZ — so you're covered.",
  },
  {
    n: "06",
    q: "Can I re-export with different settings?",
    a: "Yes — every purchase includes unlimited re-exports of the same photo for 30 days. Tweak density, depth, contrast, margins, and pull fresh files as many times as you want.",
  },
];

export default function GuidePage() {
  return (
    <>
      <NavBar active="guide" />
      <main className="flex-1">
        <section className="pc-section">
          <div className="pc-section-head">
            <div className="pc-kicker">guide</div>
            <h2>Everything you need to engrave beautifully.</h2>
            <p className="pc-section-sub">
              The short version: upload a photo, pick a preset, download the file
              your laser expects. The long version is below.
            </p>
          </div>

          <div className="guide-grid">
            {QA.map((x) => (
              <div key={x.n} className="guide-card">
                <div className="gc-n">{x.n}</div>
                <div className="gc-q">{x.q}</div>
                <div className="gc-a">{x.a}</div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="pc-footer">
        <div className="pc-footer-inner">
          <span>© {new Date().getFullYear()} pointcloud3D</span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/pricing">Pricing</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
