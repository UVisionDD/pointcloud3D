import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

import { NavBar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckoutButton } from "@/components/checkout-button";

export default function PricingPage() {
  // Price IDs live server-side so the client bundle never sees them.
  const payg = [
    {
      name: "Single export",
      price: "€1.99",
      description: "One photo, all formats, 30-day re-exports.",
      priceId: process.env.STRIPE_PRICE_PAYG_SINGLE,
      mode: "payment" as const,
    },
    {
      name: "3-pack",
      price: "€4.99",
      description: "Three photos, save over single exports.",
      priceId: process.env.STRIPE_PRICE_PAYG_THREE_PACK,
      mode: "payment" as const,
      featured: true,
    },
  ];
  const subs = [
    {
      name: "Basic",
      price: "€9.99 / mo",
      description: "30 exports per month. Perfect for side-gigs.",
      priceId: process.env.STRIPE_PRICE_SUB_BASIC,
      mode: "subscription" as const,
    },
    {
      name: "Pro",
      price: "€14.99 / mo",
      description: "100 exports. For small businesses.",
      priceId: process.env.STRIPE_PRICE_SUB_PRO,
      mode: "subscription" as const,
      featured: true,
    },
    {
      name: "Max",
      price: "€19.99 / mo",
      description: "Unlimited (fair-use). For production shops.",
      priceId: process.env.STRIPE_PRICE_SUB_MAX,
      mode: "subscription" as const,
    },
  ];

  return (
    <>
      <NavBar />
      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold">Pricing</h1>
            <p className="mt-3 text-muted-foreground">
              Pay per photo or subscribe. Every purchase includes unlimited
              re-exports of that photo for 30 days.
            </p>
          </div>

          <h2 className="mt-12 text-lg font-semibold">Pay as you go</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {payg.map((p) => (
              <PlanCard key={p.name} plan={p} />
            ))}
          </div>

          <h2 className="mt-12 text-lg font-semibold">Subscriptions</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {subs.map((p) => (
              <PlanCard key={p.name} plan={p} />
            ))}
          </div>

          <div className="mt-10 text-center text-sm text-muted-foreground">
            All prices in EUR. Taxes calculated at checkout.
          </div>
        </section>
      </main>
    </>
  );
}

function PlanCard({
  plan,
}: {
  plan: {
    name: string;
    price: string;
    description: string;
    priceId: string | undefined;
    mode: "payment" | "subscription";
    featured?: boolean;
  };
}) {
  return (
    <Card className={plan.featured ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{plan.name}</span>
          {plan.featured ? (
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
              Popular
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-bold">{plan.price}</div>
        <p className="text-sm text-muted-foreground">{plan.description}</p>
        <SignedIn>
          <CheckoutButton
            priceId={plan.priceId}
            mode={plan.mode}
            label={plan.mode === "subscription" ? "Subscribe" : "Buy"}
          />
        </SignedIn>
        <SignedOut>
          <Link href="/sign-up">
            <Button className="w-full">Get started</Button>
          </Link>
        </SignedOut>
      </CardContent>
    </Card>
  );
}
