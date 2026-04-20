export interface Entitlements {
  subscription: { plan: string } | null;
  paygCredits: number;
}

export async function getEntitlements(
  _userId: string,
): Promise<Entitlements> {
  return { subscription: null, paygCredits: 0 };
}
