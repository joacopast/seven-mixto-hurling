"use client";

import { useActionState, useState } from "react";
import type { FixtureMatchView } from "@/lib/tournament/groups-view";
import { Badge } from "@/components/ui";
import { saveResult, type ResultState } from "./actions";

export function ResultRow({ match }: { match: FixtureMatchView }) {
  const [state, action, pending] = useActionState<ResultState, FormData>(saveResult, {});
  const [mode, setMode] = useState<"score" | "walkover">(
    match.status === "WALKOVER" ? "walkover" : "score",
  );

  const done = match.status === "FINISHED" || match.status === "WALKOVER";
  const savedOk = state.ok && state.matchId === match.id;

  return (
    <tr className="align-middle">
      <td className="px-3 py-3">
        <form action={action} className="flex flex-col gap-2.5">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="mode" value={mode} />

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-ink-faint">
            <span>{match.fieldName?.replace("Cancha ", "C")}</span>
            {match.groupName && <span>Gr.{match.groupName}</span>}
          </div>

          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-right text-sm text-ink">{match.homeTeamName}</span>

            {mode === "score" ? (
              <div className="flex flex-none items-center gap-1.5">
                <input
                  name="homeScore"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={match.homeScore ?? ""}
                  className="h-11 w-14 rounded-lg border border-line bg-surface-3 text-center text-base"
                  aria-label={`Goles ${match.homeTeamName}`}
                />
                <span className="text-ink-faint">-</span>
                <input
                  name="awayScore"
                  type="number"
                  min={0}
                  max={99}
                  defaultValue={match.awayScore ?? ""}
                  className="h-11 w-14 rounded-lg border border-line bg-surface-3 text-center text-base"
                  aria-label={`Goles ${match.awayTeamName}`}
                />
              </div>
            ) : (
              <select
                name="walkover"
                defaultValue={match.walkoverTeamId ?? "NONE"}
                className="h-11 max-w-[40%] flex-none truncate rounded-lg border border-line bg-surface-3 px-2 text-xs"
              >
                <option value={match.homeTeamId ?? ""}>Se presentó {match.homeTeamName}</option>
                <option value={match.awayTeamId ?? ""}>Se presentó {match.awayTeamName}</option>
                <option value="NONE">Doble ausencia</option>
              </select>
            )}

            <span className="min-w-0 flex-1 truncate text-sm text-ink">{match.awayTeamName}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode((m) => (m === "score" ? "walkover" : "score"))}
              className="rounded-lg border border-line px-3 py-2 text-xs text-ink-faint hover:bg-surface-2"
            >
              {mode === "score" ? "Walkover" : "Goles"}
            </button>

            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-paper px-4 py-2 text-xs font-semibold text-bg-deep disabled:opacity-50"
            >
              {pending ? "…" : done ? "Actualizar" : "Guardar"}
            </button>

            {savedOk && <Badge tone="ok">guardado</Badge>}
            {done && !savedOk && <Badge tone="neutral">{match.status === "WALKOVER" ? "W.O." : "cargado"}</Badge>}
            {state.error && state.matchId === match.id && (
              <span className="text-xs text-danger">{state.error}</span>
            )}
          </div>
        </form>
      </td>
    </tr>
  );
}
