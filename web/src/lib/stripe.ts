import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

let _stripe: Stripe | undefined;

export function stripe(): Stripe {
  if (!_stripe) {
    const key = serverEnv().STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, { typescript: true });
  }
  return _stripe;
}

/**
 * Map a Stripe price id to our internal plan slug + monthly export allowance.
 * Env-driven so pricing can be tuned without code changes.
 */
export function planForPrice(priceId: string): {
  plan: "basic" | "pro" | "max" | "payg";
  monthlyExports: number; // -1 = unlimited (fair use)
} | null {
  const e = serverEnv();
  if (priceId === e.STRIPE_PRICE_SUB_BASIC) return { plan: "basic", monthlyExports: 30 };
  if (priceId === e.STRIPE_PRICE_SUB_PRO) return { plan: "pro", monthlyExports: 100 };
  if (priceId === e.STRIPE_PRICE_SUB_MAX) return { plan: "max", monthlyExports: -1 };
  if (
    priceId === e.STRIPE_PRICE_PAYG_SINGLE ||
    priceId === e.STRIPE_PRICE_PAYG_THREE_PACK
  ) {
    return { plan: "payg", monthlyExports: 0 };
  }
  return null;
}

/** Credits granted for a given PAYG price. */
export function paygCreditsForPrice(priceId: string): number {
  const e = serverEnv();
  if (priceId === e.STRIPE_PRICE_PAYG_SINGLE) return 1;
  if (priceId === e.STRIPE_PRICE_PAYG_THREE_PACK) return 3;
  return 0;
}
