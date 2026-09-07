import type { CupView, BracketMatchView } from "@/lib/tournament/bracket-view";

const CUP_COLOR: Record<string, string> = {
  ORO: "var(--cup-oro)",
  PLATA: "var(--cup-plata)",
  BRONCE: "var(--cup-bronce)",
  MADERA: "var(--cup-madera)",
};

function scoreOf(m: BracketMatchView): { home: string; away: string } {
  if (m.status === "WALKOVER") {
    return {
      home: m.walkoverTeamId === m.homeTeamId ? "W" : "—",
      away: m.walkoverTeamId === m.awayTeamId ? "W" : "—",
    };
  }
  if (m.status === "FINISHED") {
    const so =
      m.homeShootout != null && m.awayShootout != null
        ? ` (${m.homeShootout}-${m.awayShootout})`
        : "";
    return {
      home: `${m.homeScore}${m.homeShootout != null ? ` (${m.homeShootout})` : ""}`,
      away: `${m.awayScore}${m.awayShootout != null ? ` (${m.awayShootout})` : ""}`,
    };
  }
  void scoreOf;
  return { home: "", away: "" };
}

function MatchCard({ m }: { m: BracketMatchView }) {
  const finished = m.status === "FINISHED" || m.status === "WALKOVER";
  const s = scoreOf(m);
  const side = (teamId: string | null, name: string | null, score: string) => {
    const isWinner = finished && m.winnerTeamId != null && m.winnerTeamId === teamId;
    return (
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${
          isWinner ? "text-paper" : "text-ink-soft"
        }`}
      >
        <span className={`truncate text-[13px] ${isWinner ? "font-semibold" : ""}`}>
          {name ?? <span className="text-ink-faint">Por definir</span>}
        </span>
        <span className="font-mono text-[13px] tabular-nums">{score}</span>
      </div>
    );
  };

  return (
    <div
      className={`w-44 shrink-0 overflow-hidden rounded-xl border ${
        finished ? "border-line-soft bg-surface" : "border-dashed border-line bg-transparent"
      }`}
    >
      {side(m.homeTeamId, m.homeTeamName, s.home)}
      <div className="h-px bg-line-soft" />
      {side(m.awayTeamId, m.awayTeamName, s.away)}
      {m.startsAt && (
        <div className="border-t border-line-soft px-2.5 py-1 font-mono text-[10px] text-ink-faint">
          {m.startsAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
          {m.fieldName ? ` · ${m.fieldName.replace("Cancha ", "C")}` : ""}
        </div>
      )}
    </div>
  );
}

export function BracketView({ cup }: { cup: CupView }) {
  const activeRounds = cup.rounds.filter((r) => r.matches.length > 0);
  return (
    <div className="rounded-card border border-line-soft bg-bg-deep/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-paper">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: CUP_COLOR[cup.name] ?? "var(--accent)" }}
          />
          Copa {cup.name}
        </h3>
        {cup.championName && (
          <span className="font-mono text-[11px] text-ink-faint">
            🏆 {cup.championName}
          </span>
        )}
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-6">
          {activeRounds.map((round) => (
            <div key={round.round} className="flex flex-col gap-3">
              <p className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">
                {round.label}
              </p>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {round.matches.map((m) => (
                  <MatchCard key={m.matchId} m={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
