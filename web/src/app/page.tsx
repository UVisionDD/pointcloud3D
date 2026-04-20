import { auth } from "@clerk/nextjs/server";

import { Studio } from "@/components/studio";
import { getEntitlements } from "@/lib/quota";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { userId } = await auth();
  const signedIn = Boolean(userId);

  let plan: string | null = null;
  let credits = 0;
  if (userId) {
    const entitlements = await getEntitlements(userId);
    plan = entitlements.subscription?.plan ?? null;
    credits = entitlements.paygCredits ?? 0;
  }

  return (
    <Studio
      signedIn={signedIn}
      plan={plan}
      credits={credits}
      priceIds={{ single: process.env.STRIPE_PRICE_PAYG_SINGLE }}
    />
  );
}
