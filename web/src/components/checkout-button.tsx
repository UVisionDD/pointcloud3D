"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface Props {
  priceId: string | undefined;
  mode: "payment" | "subscription";
  jobId?: string;
  label?: string;
}

export function CheckoutButton({ priceId, mode, jobId, label }: Props) {
  const [busy, setBusy] = useState(false);
  const disabled = !priceId || busy;

  return (
    <Button
      className="w-full"
      disabled={disabled}
      onClick={async () => {
        if (!priceId) return;
        setBusy(true);
        try {
          const r = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priceId, mode, jobId }),
          });
          if (!r.ok) throw new Error(`checkout failed: ${r.status}`);
          const { url } = (await r.json()) as { url: string };
          window.location.href = url;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Checkout failed");
          setBusy(false);
        }
      }}
    >
      {busy ? "Redirecting…" : !priceId ? "Setup required" : (label ?? "Buy")}
    </Button>
  );
}
