"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { startCheckout } from "../actions";

export function PayButton({ registrationId }: { registrationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setLoading(true);
    setError(null);
    const res = await startCheckout(registrationId);
    if (res.ok && res.checkoutUrl) {
      window.location.href = res.checkoutUrl;
      return;
    }
    setError(res.error ?? "No pudimos iniciar el pago.");
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <Button size="lg" onClick={go} disabled={loading} className="w-full">
        {loading ? "Redirigiendo a Mercado Pago…" : "Pagar con Mercado Pago"}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
