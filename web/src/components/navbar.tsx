import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";

export async function NavBar() {
  const { userId } = await auth();
  const signedIn = Boolean(userId);

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
          {signedIn ? (
            <>
              <Link href="/dashboard">
                <Button size="sm" variant="outline">
                  Dashboard
                </Button>
              </Link>
              <UserButton />
            </>
          ) : (
            <>
              <Link href="/sign-in">
                <Button variant="ghost" size="sm">
                  Sign in
                </Button>
              </Link>
              <Link href="/sign-up">
                <Button size="sm">Get started</Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
