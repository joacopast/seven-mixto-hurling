import Link from "next/link";
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
        className={`flex items-start justify-between gap-2 px-2.5 py-1.5 ${
          isWinner ? "text-paper" : "text-ink-soft"
        }`}
      >
        {teamId && name ? (
          <Link
            href={`/equipos/${teamId}`}
            className={`min-w-0 flex-1 text-[12px] leading-snug hover:underline ${isWinner ? "font-semibold" : ""}`}
          >
            {name}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 text-[12px] leading-snug text-ink-faint">Por definir</span>
        )}
        <span className="shrink-0 pt-px font-mono text-[13px] tabular-nums">{score}</span>
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

/** Podio de una copa: 🥇🥈🥉. Se usa tanto en el panel admin como en /torneo. */
export function CupPodium({ cup }: { cup: CupView }) {
  return (
    <div className="min-w-0 rounded-card border border-line-soft bg-bg-deep/40 p-4">
      <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-paper">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: CUP_COLOR[cup.name] ?? "var(--accent)" }}
        />
        Copa {cup.name}
      </h3>
      <ol className="flex flex-col gap-1.5 text-sm">
        <li className="flex items-start gap-2">
          <span className="w-5 flex-none text-center">🥇</span>
          {cup.championTeamId && cup.championName ? (
            <Link
              href={`/equipos/${cup.championTeamId}`}
              className="min-w-0 flex-1 leading-snug text-paper hover:underline"
            >
              {cup.championName}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 leading-snug text-ink-faint">Por definir</span>
          )}
        </li>
        <li className="flex items-start gap-2">
          <span className="w-5 flex-none text-center">🥈</span>
          {cup.runnerUpTeamId && cup.runnerUpName ? (
            <Link
              href={`/equipos/${cup.runnerUpTeamId}`}
              className="min-w-0 flex-1 leading-snug text-ink-soft hover:underline"
            >
              {cup.runnerUpName}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 leading-snug text-ink-faint">Por definir</span>
          )}
        </li>
        <li className="flex items-start gap-2">
          <span className="w-5 flex-none text-center">🥉</span>
          {cup.thirdPlace.length > 0 ? (
            <span className="min-w-0 flex-1 leading-snug text-ink-soft">
              {cup.thirdPlace.map((t, i) => (
                <span key={t.teamId}>
                  {i > 0 && " y "}
                  <Link href={`/equipos/${t.teamId}`} className="hover:underline">
                    {t.name}
                  </Link>
                </span>
              ))}
            </span>
          ) : (
            <span className="min-w-0 flex-1 leading-snug text-ink-faint">Por definir</span>
          )}
        </li>
      </ol>
    </div>
  );
}

/** Grilla de podios de todas las copas. */
export function TournamentPodium({ cups }: { cups: CupView[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cups.map((cup) => (
        <CupPodium key={cup.id} cup={cup} />
      ))}
    </div>
  );
}

export function BracketView({ cup }: { cup: CupView }) {
  const activeRounds = cup.rounds.filter((r) => r.matches.length > 0);
  return (
    <div className="min-w-0 rounded-card border border-line-soft bg-bg-deep/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="flex items-center gap-2 font-display text-xl font-semibold text-paper">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: CUP_COLOR[cup.name] ?? "var(--accent)" }}
          />
          Copa {cup.name}
        </h3>
        {cup.championName && (
          <span className="min-w-0 font-mono text-[11px] text-ink-faint">
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
