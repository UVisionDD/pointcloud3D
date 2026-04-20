"use client";

export function CheckoutButton({
  priceId,
  mode,
  label,
}: {
  priceId?: string;
  mode: "payment" | "subscription";
  label: string;
}) {
  const handleClick = async () => {
    if (!priceId) return;
    const r = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceId, mode }),
    });
    if (r.ok) {
      const { url } = (await r.json()) as { url: string };
      window.location.href = url;
    }
  };

  return (
    <button
      type="button"
      className="pc-btn pc-btn-primary pc-btn-block"
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
