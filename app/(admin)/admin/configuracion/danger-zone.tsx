"use client";

import { useState, useTransition } from "react";
import { Card, Button } from "@/components/ui";
import { resetTournamentAction } from "./actions";

/**
 * Vaciar el torneo para reusarlo en una edición nueva. Irreversible — borra
 * equipos, jugadores, inscripciones, pagos, grupos, copas y partidos. El
 * botón queda deshabilitado hasta escribir el nombre exacto del torneo, y
 * server-side se revalida igual (nunca confiar solo en esto).
 */
export function ResetTournamentDangerZone({ tournamentName }: { tournamentName: string }) {
  const [confirmText, setConfirmText] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string; summary?: Record<string, number> } | null>(
    null,
  );

  const matches = confirmText.trim() === tournamentName;

  function handleClick() {
    if (!matches) return;
    if (
      !window.confirm(
        `Última confirmación: esto borra TODOS los equipos, jugadores, inscripciones, pagos, grupos, copas y partidos de "${tournamentName}". No se puede deshacer. ¿Seguro?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await resetTournamentAction(confirmText);
      setResult(res);
      if (res.ok) setConfirmText("");
    });
  }

  return (
    <Card className="border-danger/40">
      <h2 className="font-display text-lg font-semibold text-danger">Zona de peligro</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Vaciar el torneo para arrancar una edición nueva: borra equipos, jugadores,
        inscripciones, pagos, grupos, copas y partidos. El torneo (nombre, fechas, precios,
        datos bancarios) queda — lo editás arriba para la edición nueva. El registro de
        auditoría de esta edición queda como historial. <strong>No se puede deshacer.</strong>
      </p>

      <label htmlFor="reset-confirm" className="mt-4 block text-sm font-semibold text-ink">
        Escribí <span className="font-mono text-danger">{tournamentName}</span> para habilitar el botón
      </label>
      <input
        id="reset-confirm"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="mt-1.5 h-10 w-full max-w-sm rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink outline-none focus:border-danger"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="mt-4">
        <Button variant="danger" disabled={!matches || pending} onClick={handleClick}>
          {pending ? "Borrando…" : "Vaciar torneo"}
        </Button>
      </div>

      {result?.error && <p className="mt-2 text-sm text-danger">{result.error}</p>}
      {result?.ok && result.summary && (
        <p className="mt-2 text-sm text-ok">
          Listo — se borraron {result.summary.teams} equipos, {result.summary.matches} partidos,{" "}
          {result.summary.groups} grupos y {result.summary.cups} copas. El torneo volvió a
          &ldquo;En preparación&rdquo;.
        </p>
      )}
    </Card>
  );
}
