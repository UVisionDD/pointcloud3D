import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import { NavBar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LandingPage() {
  return (
    <>
      <NavBar />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Sharper point clouds for laser engraving.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Turn any photo into a 3D point cloud tuned for inner-crystal laser
            engraving. Pay per export or subscribe — unlimited re-exports of the
            same photo for 30 days.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <SignedOut>
              <Link href="/sign-up">
                <Button size="lg">Start for free</Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline">
                  See pricing
                </Button>
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard/upload">
                <Button size="lg">Upload a photo</Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="outline">
                  My jobs
                </Button>
              </Link>
            </SignedIn>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-3">
          {[
            {
              title: "Designed for crystal",
              body: "Depth tuned for how the laser actually creates fracture points in glass. Not a depth map dumped into a mesh.",
            },
            {
              title: "Every format your laser wants",
              body: "STL for RK-CAD / BSL, GLB for xTool, DXF for green lasers, plus PLY and XYZ. One job, all formats.",
            },
            {
              title: "30-day re-exports",
              body: "Unhappy with the first pass? Tweak parameters and re-export for free within 30 days of purchase.",
            },
          ].map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <CardTitle>{f.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">{f.body}</CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} pointcloud3D</span>
          <div className="flex gap-4">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
