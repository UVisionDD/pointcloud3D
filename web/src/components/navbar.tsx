import Link from "next/link";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function NavBar() {
  return (
    <header className="border-b">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-lg">pointcloud3D</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            sharper point clouds for crystal engraving
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/pricing"
            className="hidden rounded-md px-3 py-1.5 text-sm hover:bg-accent sm:inline-block"
          >
            Pricing
          </Link>
          <SignedOut>
            <Link href="/sign-in">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button size="sm">Get started</Button>
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard">
              <Button size="sm" variant="outline">
                Dashboard
              </Button>
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </nav>
    </header>
  );
}
