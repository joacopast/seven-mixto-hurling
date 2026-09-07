"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Button, Select } from "@/components/ui";
import { saveGroups, type SaveGroupsState } from "./actions";

interface Team {
  id: string;
  name: string;
  seed: number | null;
  /** Cantidad de jugadores reales (no cuenta a los no-jugadores). */
  playerCount: number;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function GroupEditor({
  teams,
  groupCount,
  groupSize,
  initialAssignment,
}: {
  teams: Team[];
  groupCount: number;
  groupSize: number;
  initialAssignment: Record<string, number>;
}) {
  const [assignment, setAssignment] = useState<Record<string, number>>(() => {
    const a: Record<string, number> = {};
    teams.forEach((t, i) => {
      a[t.id] = initialAssignment[t.id] ?? i % groupCount;
    });
    return a;
  });
  const [state, formAction, pending] = useActionState<SaveGroupsState, FormData>(saveGroups, {});

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const { counts, playerTotals } = useMemo(() => {
    const c = new Array(groupCount).fill(0);
    const p = new Array(groupCount).fill(0);
    for (const [teamId, g] of Object.entries(assignment)) {
      if (g < 0 || g >= groupCount) continue;
      c[g]++;
      p[g] += teamById.get(teamId)?.playerCount ?? 0;
    }
    return { counts: c, playerTotals: p };
  }, [assignment, groupCount, teamById]);

  const avgPlayers = playerTotals.filter((_, i) => counts[i] > 0);
  const maxDelta =
    avgPlayers.length > 1 ? Math.max(...avgPlayers) - Math.min(...avgPlayers) : 0;

  /** Serpiente por seed manual si está todo cargado; si no, por jugadores reales. */
  function distributeEvenly() {
    const allSeeded = teams.length > 0 && teams.every((t) => t.seed != null);
    const sorted = [...teams].sort((a, b) => {
      if (allSeeded) return a.seed! - b.seed!;
      if (a.playerCount !== b.playerCount) return b.playerCount - a.playerCount;
      return a.name.localeCompare(b.name);
    });
    const next: Record<string, number> = {};
    let dir = 1;
    let g = 0;
    for (const t of sorted) {
      next[t.id] = g;
      if (dir === 1 && g === groupCount - 1) dir = -1;
      else if (dir === -1 && g === 0) dir = 1;
      else g += dir;
    }
    setAssignment(next);
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="groupCount" value={groupCount} />
      {Object.entries(assignment).map(([teamId, g]) => (
        <input key={teamId} type="hidden" name="assignment" value={`${teamId}:${g}`} />
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" onClick={distributeEvenly}>
          Repartir parejo (serpiente por jugadores)
        </Button>
        <span className="text-xs text-ink-faint">
          Objetivo: {groupCount} grupos de {groupSize} · cuenta solo jugadores, no acompañantes
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {counts.map((n, i) => (
          <span
            key={i}
            className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
              n === groupSize ? "border-ok/40 text-ok" : "border-line text-ink-faint"
            }`}
            title={`${playerTotals[i]} jugadores en el grupo ${LETTERS[i]}`}
          >
            {LETTERS[i]}:{n} · {playerTotals[i]}j
          </span>
        ))}
        {maxDelta > 0 && (
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-xs text-ink-faint">
            Δ jugadores entre grupos: {maxDelta}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-card border border-line-soft">
        <table className="w-full min-w-[30rem] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">Equipo</th>
              <th className="px-3 py-2">Jugadores</th>
              <th className="px-3 py-2">Seed</th>
              <th className="px-3 py-2">Grupo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {teams.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-1.5 text-ink">{t.name}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-ink-soft">{t.playerCount}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-ink-faint">{t.seed ?? "—"}</td>
                <td className="px-3 py-1.5">
                  <Select
                    value={assignment[t.id]}
                    onChange={(e) =>
                      setAssignment((a) => ({ ...a, [t.id]: Number(e.target.value) }))
                    }
                    className="h-8 w-20"
                  >
                    {Array.from({ length: groupCount }, (_, i) => (
                      <option key={i} value={i}>
                        {LETTERS[i]}
                      </option>
                    ))}
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar grupos"}
        </Button>
        {state.message && <span className="text-sm text-ok">{state.message}</span>}
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}
