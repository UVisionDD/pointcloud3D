import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { NavBar } from "@/components/navbar";
import { HeroOrb } from "@/components/hero-orb";

export default async function LandingPage() {
  const { userId } = await auth();
  const signedIn = Boolean(userId);

  const features = [
    {
      n: "01",
      h: "Designed for crystal",
      b: "Depth tuned for how a fibre laser actually creates fracture points inside glass. Not a depth map dumped into a mesh — a density field shaped for engraving.",
    },
    {
      n: "02",
      h: "Every format your laser wants",
      b: "STL for RK-CAD & BSL, GLB for xTool, DXF for green DPSS lasers, plus PLY and XYZ. One job produces all formats.",
    },
    {
      n: "03",
      h: "30-day re-exports",
      b: "Unhappy with the first pass? Tweak density, depth, contrast — re-export for free within 30 days of purchase.",
    },
  ];

  return (
    <>
      <NavBar />
      <main className="flex-1">
        <section className="pc-hero">
          <div className="pc-kicker">photo → point cloud → crystal</div>
          <h1>
            Sharper point clouds<br />for <span className="accented">crystal engraving.</span>
          </h1>
          <p className="lead">
            Turn any photo into a 3D point cloud of 500k–2M fracture points,
            tuned for inner-crystal laser engraving. Pay per export or subscribe —
            unlimited re-exports of the same photo for 30 days.
          </p>
          <div className="pc-hero-ctas">
            {signedIn ? (
              <>
                <Link href="/dashboard/upload" className="pc-btn pc-btn-primary pc-btn-lg">Upload a photo</Link>
                <Link href="/dashboard" className="pc-btn pc-btn-ghost pc-btn-lg">My jobs</Link>
              </>
            ) : (
              <>
                <Link href="/sign-up" className="pc-btn pc-btn-primary pc-btn-lg">Start for free</Link>
                <Link href="/pricing" className="pc-btn pc-btn-ghost pc-btn-lg">See pricing</Link>
              </>
            )}
          </div>
          <HeroOrb />
        </section>

        <section className="feat-grid">
          {features.map((f) => (
            <div key={f.n} className="feat-card">
              <div className="feat-n">{f.n}</div>
              <div className="feat-h">{f.h}</div>
              <div className="feat-b">{f.b}</div>
            </div>
          ))}
        </section>
      </main>

      <footer className="pc-footer">
        <div className="pc-footer-inner">
          <span>© {new Date().getFullYear()} pointcloud3D</span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/guide">Guide</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
