"use client";

import { useActionState, useState } from "react";
import type { BracketMatchView } from "@/lib/tournament/bracket-view";
import { Badge } from "@/components/ui";
import { saveCupResult, type CupResultState } from "./actions";

export function CupResultRow({ m }: { m: BracketMatchView }) {
  const [state, action, pending] = useActionState<CupResultState, FormData>(saveCupResult, {});
  const [mode, setMode] = useState<"score" | "walkover">(
    m.status === "WALKOVER" ? "walkover" : "score",
  );
  const [tie, setTie] = useState(
    m.status === "FINISHED" && m.homeScore != null && m.homeScore === m.awayScore,
  );

  const ready = Boolean(m.homeTeamId && m.awayTeamId);
  const done = m.status === "FINISHED" || m.status === "WALKOVER";
  const savedOk = state.ok && state.matchId === m.matchId;

  if (!ready) {
    return (
      <tr>
        <td className="px-3 py-2 text-sm text-ink-faint">
          <span className="mr-2 w-8 font-mono text-[11px]">{m.fieldName?.replace("Cancha ", "C")}</span>
          {m.homeTeamName ?? "Por definir"} <span className="mx-1">vs</span>{" "}
          {m.awayTeamName ?? "Por definir"}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-3 py-3">
        <form action={action} className="flex flex-col gap-2.5">
          <input type="hidden" name="matchId" value={m.matchId} />
          <input type="hidden" name="mode" value={mode} />
          {state.needsCascade && <input type="hidden" name="confirmCascade" value="on" />}

          <span className="font-mono text-[11px] text-ink-faint">{m.fieldName?.replace("Cancha ", "C")}</span>

          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-right text-sm text-ink">{m.homeTeamName}</span>

            {mode === "score" ? (
              <div className="flex flex-none items-center gap-1.5">
                <input
                  name="homeScore"
                  type="number"
                  min={0}
                  defaultValue={m.homeScore ?? ""}
                  onChange={(e) => {
                    const away = (e.currentTarget.form?.elements.namedItem("awayScore") as HTMLInputElement)?.value;
                    setTie(away !== "" && e.currentTarget.value === away);
                  }}
                  className="h-11 w-14 rounded-lg border border-line bg-surface-3 text-center text-base"
                  aria-label={`Goles ${m.homeTeamName}`}
                />
                <span className="text-ink-faint">-</span>
                <input
                  name="awayScore"
                  type="number"
                  min={0}
                  defaultValue={m.awayScore ?? ""}
                  onChange={(e) => {
                    const home = (e.currentTarget.form?.elements.namedItem("homeScore") as HTMLInputElement)?.value;
                    setTie(home !== "" && e.currentTarget.value === home);
                  }}
                  className="h-11 w-14 rounded-lg border border-line bg-surface-3 text-center text-base"
                  aria-label={`Goles ${m.awayTeamName}`}
                />
              </div>
            ) : (
              <select
                name="walkover"
                defaultValue={m.walkoverTeamId ?? m.homeTeamId ?? ""}
                className="h-11 max-w-[40%] flex-none truncate rounded-lg border border-line bg-surface-3 px-2 text-xs"
              >
                <option value={m.homeTeamId ?? ""}>Se presentó {m.homeTeamName}</option>
                <option value={m.awayTeamId ?? ""}>Se presentó {m.awayTeamName}</option>
              </select>
            )}

            <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.awayTeamName}</span>
          </div>

          {mode === "score" && tie && (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-ink-faint">
              pen.
              <input
                name="homeShootout"
                type="number"
                min={0}
                defaultValue={m.homeShootout ?? ""}
                className="h-10 w-12 rounded-lg border border-line bg-surface-3 text-center text-base"
                aria-label="Penales local"
              />
              -
              <input
                name="awayShootout"
                type="number"
                min={0}
                defaultValue={m.awayShootout ?? ""}
                className="h-10 w-12 rounded-lg border border-line bg-surface-3 text-center text-base"
                aria-label="Penales visitante"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode((x) => (x === "score" ? "walkover" : "score"))}
              className="rounded-lg border border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-2"
            >
              {mode === "score" ? "Walkover" : "Goles"}
            </button>

            <button
              type="submit"
              disabled={pending}
              className={`rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-50 ${
                state.needsCascade ? "bg-warn text-bg-deep" : "bg-paper text-bg-deep"
              }`}
            >
              {pending ? "…" : state.needsCascade ? "Confirmar recálculo" : done ? "Actualizar" : "Guardar"}
            </button>

            {savedOk && <Badge tone="ok">guardado</Badge>}
            {done && !savedOk && !state.needsCascade && (
              <Badge tone="neutral">{m.status === "WALKOVER" ? "W.O." : "cargado"}</Badge>
            )}
            {state.error && state.matchId === m.matchId && (
              <span className="max-w-xs text-xs text-danger">{state.error}</span>
            )}
          </div>
        </form>
      </td>
    </tr>
  );
}
