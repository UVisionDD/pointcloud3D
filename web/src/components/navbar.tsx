import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

import { Wordmark } from "@/components/wordmark";

export async function NavBar({ active }: { active?: "studio" | "guide" | "pricing" }) {
  const { userId } = await auth();
  const signedIn = Boolean(userId);

  return (
    <header className="pc-nav">
      <nav className="pc-nav-inner">
        <Link href="/">
          <Wordmark size={14} />
        </Link>
        <div className="pc-nav-links">
          <Link href="/dashboard" className={active === "studio" ? "on" : ""}>Studio</Link>
          <Link href="/guide" className={active === "guide" ? "on" : ""}>Guide</Link>
          <Link href="/pricing" className={active === "pricing" ? "on" : ""}>Pricing</Link>
        </div>
        <div className="pc-nav-right">
          {signedIn ? (
            <>
              <Link href="/dashboard" className="pc-btn pc-btn-ghost">Dashboard</Link>
              <UserButton />
            </>
          ) : (
            <>
              <Link href="/sign-in" className="pc-btn pc-btn-ghost">Sign in</Link>
              <Link href="/sign-up" className="pc-btn pc-btn-primary">Get started</Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
