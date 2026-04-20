import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { Studio } from "@/components/studio";
import { getEntitlements } from "@/lib/quota";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const entitlements = await getEntitlements(userId);
  const plan = entitlements.subscription?.plan ?? null;
  const credits = entitlements.paygCredits ?? 0;

  return (
    <Studio
      signedIn
      plan={plan}
      credits={credits}
      priceIds={{ single: process.env.STRIPE_PRICE_PAYG_SINGLE }}
    />
  );
}
