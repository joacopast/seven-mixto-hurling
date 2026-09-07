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
      <td className="px-3 py-2">
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="mode" value={mode} />

          <span className="w-8 font-mono text-[11px] text-ink-faint">{match.fieldName?.replace("Cancha ", "C")}</span>
          {match.groupName && (
            <span className="font-mono text-[11px] text-ink-faint">Gr.{match.groupName}</span>
          )}

          <span className="min-w-[7rem] text-right text-ink">{match.homeTeamName}</span>

          {mode === "score" ? (
            <>
              <input
                name="homeScore"
                type="number"
                min={0}
                max={99}
                defaultValue={match.homeScore ?? ""}
                className="h-8 w-12 rounded-lg border border-line bg-surface-3 text-center text-sm"
                aria-label={`Goles ${match.homeTeamName}`}
              />
              <span className="text-ink-faint">-</span>
              <input
                name="awayScore"
                type="number"
                min={0}
                max={99}
                defaultValue={match.awayScore ?? ""}
                className="h-8 w-12 rounded-lg border border-line bg-surface-3 text-center text-sm"
                aria-label={`Goles ${match.awayTeamName}`}
              />
            </>
          ) : (
            <select
              name="walkover"
              defaultValue={match.walkoverTeamId ?? "NONE"}
              className="h-8 rounded-lg border border-line bg-surface-3 px-2 text-xs"
            >
              <option value={match.homeTeamId ?? ""}>Se presentó {match.homeTeamName}</option>
              <option value={match.awayTeamId ?? ""}>Se presentó {match.awayTeamName}</option>
              <option value="NONE">Doble ausencia</option>
            </select>
          )}

          <span className="min-w-[7rem] text-ink">{match.awayTeamName}</span>

          <button
            type="button"
            onClick={() => setMode((m) => (m === "score" ? "walkover" : "score"))}
            className="rounded px-2 py-1 text-[11px] text-ink-faint hover:bg-surface-2"
          >
            {mode === "score" ? "walkover" : "goles"}
          </button>

          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-bg-deep disabled:opacity-50"
          >
            {pending ? "…" : done ? "Actualizar" : "Guardar"}
          </button>

          {savedOk && <Badge tone="ok">guardado</Badge>}
          {done && !savedOk && <Badge tone="neutral">{match.status === "WALKOVER" ? "W.O." : "cargado"}</Badge>}
          {state.error && state.matchId === match.id && (
            <span className="text-xs text-danger">{state.error}</span>
          )}
        </form>
      </td>
    </tr>
  );
}
