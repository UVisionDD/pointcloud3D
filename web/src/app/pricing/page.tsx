import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { NavBar } from "@/components/navbar";
import { CheckoutButton } from "@/components/checkout-button";

type Plan = {
  name: string;
  amt: string;
  unit: string;
  blurb: string;
  bullets: string[];
  priceId: string | undefined;
  mode: "payment" | "subscription";
  featured?: boolean;
};

export default async function PricingPage() {
  const { userId } = await auth();
  const signedIn = Boolean(userId);

  const payg: Plan[] = [
    {
      name: "Single",
      amt: "€1.99",
      unit: "one photo",
      blurb: "One photo, all formats, 30-day re-exports.",
      bullets: ["STL · GLB · DXF · PLY · XYZ", "Up to 2M points", "30-day re-exports"],
      priceId: process.env.STRIPE_PRICE_PAYG_SINGLE,
      mode: "payment",
    },
    {
      name: "3-pack",
      amt: "€4.99",
      unit: "three photos",
      blurb: "Three photos, save over single exports.",
      bullets: ["Same as Single", "Save ~17%", "Credits never expire"],
      priceId: process.env.STRIPE_PRICE_PAYG_THREE_PACK,
      mode: "payment",
      featured: true,
    },
  ];

  const subs: Plan[] = [
    {
      name: "Basic",
      amt: "€9.99",
      unit: "/ month",
      blurb: "30 exports per month. Perfect for side-gigs.",
      bullets: ["30 exports / month", "All formats", "30-day re-exports"],
      priceId: process.env.STRIPE_PRICE_SUB_BASIC,
      mode: "subscription",
    },
    {
      name: "Pro",
      amt: "€14.99",
      unit: "/ month",
      blurb: "100 exports. For small studios and businesses.",
      bullets: ["100 exports / month", "Priority queue", "Email support"],
      priceId: process.env.STRIPE_PRICE_SUB_PRO,
      mode: "subscription",
      featured: true,
    },
    {
      name: "Max",
      amt: "€19.99",
      unit: "/ month",
      blurb: "Unlimited (fair-use). For production shops.",
      bullets: ["Unlimited exports (fair-use)", "Priority queue", "Direct support"],
      priceId: process.env.STRIPE_PRICE_SUB_MAX,
      mode: "subscription",
    },
  ];

  return (
    <>
      <NavBar active="pricing" />
      <main className="flex-1">
        <section className="pc-section">
          <div className="pc-section-head">
            <div className="pc-kicker">pricing</div>
            <h2>Pay per photo or subscribe.</h2>
            <p className="pc-section-sub">
              Every purchase includes unlimited re-exports of that photo for 30 days.
              All prices in EUR. Taxes calculated at checkout.
            </p>
          </div>

          <div className="price-block-label">Pay as you go</div>
          <div className="price-grid two">
            {payg.map((p) => <PriceCard key={p.name} plan={p} signedIn={signedIn} />)}
          </div>

          <div className="price-block-label">Subscriptions</div>
          <div className="price-grid three">
            {subs.map((p) => <PriceCard key={p.name} plan={p} signedIn={signedIn} />)}
          </div>
        </section>
      </main>

      <footer className="pc-footer">
        <div className="pc-footer-inner">
          <span>© {new Date().getFullYear()} pointcloud3D</span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}

function PriceCard({ plan, signedIn }: { plan: Plan; signedIn: boolean }) {
  return (
    <div className={`price-card${plan.featured ? " featured" : ""}`}>
      {plan.featured ? <span className="ribbon">Popular</span> : null}
      <div className="pc-name">{plan.name}</div>
      <div className="pc-amt">
        <span className="amt">{plan.amt}</span>
        <span className="unit">{plan.unit}</span>
      </div>
      <div className="pc-blurb">{plan.blurb}</div>
      <ul className="pc-list">
        {plan.bullets.map((b) => (
          <li key={b}><span className="tick-mark">✓</span><span>{b}</span></li>
        ))}
      </ul>
      {signedIn ? (
        <CheckoutButton
          priceId={plan.priceId}
          mode={plan.mode}
          label={plan.mode === "subscription" ? "Subscribe" : "Buy"}
        />
      ) : (
        <Link href="/sign-up" className="pc-btn pc-btn-primary pc-btn-block">Get started</Link>
      )}
    </div>
  );
}
