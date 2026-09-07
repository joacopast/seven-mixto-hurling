"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Button, Select } from "@/components/ui";
import { saveGroups, type SaveGroupsState } from "./actions";

interface Team {
  id: string;
  name: string;
  seed: number | null;
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

  const counts = useMemo(() => {
    const c = new Array(groupCount).fill(0);
    for (const g of Object.values(assignment)) if (g >= 0 && g < groupCount) c[g]++;
    return c;
  }, [assignment, groupCount]);

  function distributeEvenly() {
    const sorted = [...teams].sort((a, b) => {
      if (a.seed != null && b.seed != null) return a.seed - b.seed;
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
          Repartir parejo (serpiente por seed)
        </Button>
        <span className="text-xs text-ink-faint">
          Objetivo: {groupCount} grupos de {groupSize}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {counts.map((n, i) => (
          <span
            key={i}
            className={`rounded-full border px-2 py-0.5 font-mono text-xs ${
              n === groupSize ? "border-ok/40 text-ok" : "border-line text-ink-faint"
            }`}
          >
            {LETTERS[i]}:{n}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card border border-line-soft">
        <table className="w-full min-w-[28rem] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">Equipo</th>
              <th className="px-3 py-2">Seed</th>
              <th className="px-3 py-2">Grupo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {teams.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-1.5 text-ink">{t.name}</td>
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
