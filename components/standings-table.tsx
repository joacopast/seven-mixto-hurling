import type { GroupView } from "@/lib/tournament/groups-view";

/** Color de copa según la posición en el grupo (1→Oro, 2→Plata, 3→Bronce, 4→Madera). */
const CUP_DOT = [
  "var(--cup-oro)",
  "var(--cup-plata)",
  "var(--cup-bronce)",
  "var(--cup-madera)",
] as const;
const CUP_LABEL = ["ORO", "PLATA", "BRONCE", "MADERA"] as const;

export function StandingsTable({
  group,
  showCups = true,
  compact = false,
}: {
  group: GroupView;
  showCups?: boolean;
  compact?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line-soft bg-surface">
      <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
        <h3 className="font-display text-lg font-semibold text-paper">Grupo {group.name}</h3>
        <span className="font-mono text-[11px] text-ink-faint">{group.rows.length} equipos</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="px-3 py-1.5 font-medium">#</th>
              <th className="px-2 py-1.5 font-medium">Equipo</th>
              <th className="px-2 py-1.5 text-center font-medium">PJ</th>
              {!compact && <th className="px-2 py-1.5 text-center font-medium">G</th>}
              {!compact && <th className="px-2 py-1.5 text-center font-medium">E</th>}
              {!compact && <th className="px-2 py-1.5 text-center font-medium">P</th>}
              <th className="px-2 py-1.5 text-center font-medium">GF</th>
              <th className="px-2 py-1.5 text-center font-medium">GC</th>
              <th className="px-2 py-1.5 text-center font-medium">DG</th>
              <th className="px-3 py-1.5 text-center font-medium">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {group.rows.map((row, i) => {
              const rank = row.rank ?? i + 1;
              const cupIdx = rank - 1;
              return (
                <tr key={row.teamId} className="font-variant-numeric tabular-nums">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: cupIdx >= 0 && cupIdx < 4 ? CUP_DOT[cupIdx] : "var(--line)",
                        }}
                      />
                      {rank}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-ink">
                    <span className="font-medium">{row.teamShortName || row.teamName}</span>
                    {showCups && cupIdx >= 0 && cupIdx < 4 && (
                      <span className="ml-2 font-mono text-[10px] text-ink-faint">
                        {CUP_LABEL[cupIdx]}
                      </span>
                    )}
                    {row.tiebreakNote && (
                      <span className="ml-2 font-mono text-[10px] text-warn">
                        ({row.tiebreakNote})
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center text-ink-soft">{row.played}</td>
                  {!compact && <td className="px-2 py-2 text-center text-ink-soft">{row.won}</td>}
                  {!compact && <td className="px-2 py-2 text-center text-ink-soft">{row.drawn}</td>}
                  {!compact && <td className="px-2 py-2 text-center text-ink-soft">{row.lost}</td>}
                  <td className="px-2 py-2 text-center text-ink-soft">{row.goalsFor}</td>
                  <td className="px-2 py-2 text-center text-ink-soft">{row.goalsAgainst}</td>
                  <td className="px-2 py-2 text-center text-ink-soft">
                    {row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}
                  </td>
                  <td className="px-3 py-2 text-center font-semibold text-paper">{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
