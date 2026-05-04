"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  jobId?: string;
  className?: string;
}

export function DiscountCodeForm({ jobId, className }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className={className ?? "space-y-2 pt-2"}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!code.trim()) return;
        setBusy(true);
        try {
          const r = await fetch("/api/redeem-code", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: code.trim(), jobId }),
          });
          const data = (await r.json().catch(() => ({}))) as {
            error?: string;
            ok?: boolean;
            creditsGranted?: number;
            alreadyRedeemed?: boolean;
            alreadyPaid?: boolean;
          };
          if (!r.ok || !data.ok) {
            toast.error(data.error === "invalid_code" ? "Invalid code" : "Could not redeem");
            return;
          }
          if (data.alreadyRedeemed) {
            toast.info("Code already redeemed on this account");
          } else if (data.alreadyPaid) {
            toast.info("This job is already unlocked");
          } else if (data.creditsGranted) {
            toast.success(`Code applied — ${data.creditsGranted} credits added`);
          } else {
            toast.success("Code applied — downloads unlocked");
          }
          setCode("");
          router.refresh();
        } catch {
          toast.error("Network error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="text-xs text-muted-foreground">Discount code</label>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Enter code"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy ? "…" : "Apply"}
        </Button>
      </div>
    </form>
  );
}
