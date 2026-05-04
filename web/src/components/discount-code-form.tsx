"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DiscountCodeForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-2 pt-2"
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
          };
          if (!r.ok || !data.ok) {
            toast.error(data.error === "invalid_code" ? "Invalid code" : "Could not redeem");
            return;
          }
          toast.success("Code applied — downloads unlocked");
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
