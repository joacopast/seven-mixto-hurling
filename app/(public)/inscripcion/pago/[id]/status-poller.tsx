"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * El retorno del navegador desde Mercado Pago NO es la fuente de verdad: la
 * confirmación llega por webhook. Esta pantalla consulta el estado de la
 * inscripción cada pocos segundos y refresca cuando cambia.
 */
export function StatusPoller({ registrationId }: { registrationId: string }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let active = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/registrations/${registrationId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { status: string };
        if (!active) return;
        setTries((t) => t + 1);
        if (data.status !== "PAYMENT_STARTED") {
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        /* reintenta */
      }
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [registrationId, router]);

  return (
    <div className="mt-5 rounded-2xl border border-line bg-surface-2 p-4 text-sm text-ink-soft">
      <p className="font-semibold text-paper">Estamos confirmando tu pago…</p>
      <p className="mt-1">
        Puede tardar hasta un minuto. Esta página se actualiza sola cuando se acredita.
      </p>
      {tries > 12 && (
        <p className="mt-3 text-xs text-ink-faint">
          ¿Tarda demasiado? Cerrá esta pestaña y volvé a{" "}
          <a href="/mi-equipo" className="underline">
            tu portal
          </a>{" "}
          más tarde. Si el pago se hizo, tu equipo va a figurar confirmado.
        </p>
      )}
    </div>
  );
}
