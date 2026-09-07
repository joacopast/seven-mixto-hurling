/**
 * Desempate de la tabla de un grupo — función pura. Ver docs/arquitectura.html §3 y §10.
 *
 * Cascada configurable. Default:
 *   POINTS → HEAD_TO_HEAD → GOAL_DIFF → GOALS_FOR → FAIR_PLAY → DRAW_LOTS
 *
 * - HEAD_TO_HEAD se resuelve con una mini-tabla SOLO entre los equipos empatados.
 * - DRAW_LOTS es determinista (hash del id + semilla del grupo): reproducible y no
 *   manipulable, y deja constancia en `tiebreakNote`.
 * - Ningún escenario queda sin resolver.
 */
import {
  computeStandings,
  type MatchInput,
  type StandingsConfig,
  type TeamStanding,
} from "@/lib/tournament/standings";

export type TiebreakCriterion =
  | "POINTS"
  | "HEAD_TO_HEAD"
  | "GOAL_DIFF"
  | "GOALS_FOR"
  | "FAIR_PLAY"
  | "DRAW_LOTS";

export const DEFAULT_TIEBREAKERS: TiebreakCriterion[] = [
  "POINTS",
  "HEAD_TO_HEAD",
  "GOAL_DIFF",
  "GOALS_FOR",
  "FAIR_PLAY",
  "DRAW_LOTS",
];

export interface RankedTeam {
  teamId: string;
  rank: number;
  points: number;
  standing: TeamStanding;
  /** Explica el desempate cuando NO fue por puntos/diferencia normales. */
  tiebreakNote?: string;
}

interface RankContext {
  standingsConfig: StandingsConfig;
  matches: MatchInput[];
  byId: Map<string, TeamStanding>;
  /** Semilla del sorteo (ej. `${tournamentId}:${groupName}`). */
  drawSeed: string;
}

const NOTE: Partial<Record<TiebreakCriterion, string>> = {
  HEAD_TO_HEAD: "desempate por enfrentamiento directo",
  FAIR_PLAY: "desempate por fair play",
  DRAW_LOTS: "definido por sorteo",
};

/** Hash estable de string → entero sin signo (FNV-1a). */
function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function score(criterion: TiebreakCriterion, teamId: string, tiedIds: string[], ctx: RankContext): number {
  const s = ctx.byId.get(teamId)!;
  switch (criterion) {
    case "POINTS":
      return s.points;
    case "GOAL_DIFF":
      return s.goalDiff;
    case "GOALS_FOR":
      return s.goalsFor;
    case "FAIR_PLAY":
      return -s.fairPlayPoints; // menos deméritos = mejor
    case "HEAD_TO_HEAD": {
      const set = new Set(tiedIds);
      const mini = ctx.matches.filter(
        (m) => set.has(m.homeTeamId) && set.has(m.awayTeamId),
      );
      const miniTable = computeStandings(ctx.standingsConfig, tiedIds, mini);
      const row = miniTable.find((r) => r.teamId === teamId)!;
      // Prioridad dentro de la mini-tabla: puntos, luego dif. de gol, luego goles.
      return row.points * 1_000_000 + (row.goalDiff + 1000) * 1000 + row.goalsFor;
    }
    case "DRAW_LOTS":
      return hashString(`${ctx.drawSeed}:${teamId}`);
  }
}

/** Ordena un conjunto de equipos empatados aplicando la cascada de criterios. */
function orderTied(
  ids: string[],
  criteria: TiebreakCriterion[],
  ctx: RankContext,
): { id: string; note?: string }[] {
  if (ids.length <= 1) return ids.map((id) => ({ id }));
  if (criteria.length === 0) {
    // Sin criterios restantes: sorteo determinista como último recurso.
    return [...ids]
      .sort((a, b) => hashString(`${ctx.drawSeed}:${b}`) - hashString(`${ctx.drawSeed}:${a}`))
      .map((id) => ({ id, note: NOTE.DRAW_LOTS }));
  }

  const [criterion, ...rest] = criteria;

  const scored = ids.map((id) => ({ id, value: score(criterion!, id, ids, ctx) }));
  // Agrupar por valor idéntico, de mejor a peor.
  const groups = new Map<number, string[]>();
  for (const { id, value } of scored) {
    const bucket = groups.get(value) ?? [];
    bucket.push(id);
    groups.set(value, bucket);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[0] - a[0]);

  if (ordered.length === 1) {
    // Este criterio no separó: pasar al siguiente.
    return orderTied(ids, rest, ctx);
  }

  const separatedHere = criterion !== "POINTS" && criterion !== "GOAL_DIFF" && criterion !== "GOALS_FOR";

  return ordered.flatMap(([, bucket]) =>
    orderTied(bucket, rest, ctx).map((r) => ({
      id: r.id,
      note:
        r.note ??
        (separatedHere && bucket.length < ids.length ? NOTE[criterion!] : undefined),
    })),
  );
}

export function rankGroup(
  standings: TeamStanding[],
  matches: MatchInput[],
  options: {
    standingsConfig: StandingsConfig;
    criteria?: TiebreakCriterion[];
    drawSeed?: string;
  },
): RankedTeam[] {
  const criteria = options.criteria?.length ? options.criteria : DEFAULT_TIEBREAKERS;
  const ctx: RankContext = {
    standingsConfig: options.standingsConfig,
    matches,
    byId: new Map(standings.map((s) => [s.teamId, s])),
    drawSeed: options.drawSeed ?? "seed",
  };

  const ordered = orderTied(
    standings.map((s) => s.teamId),
    criteria,
    ctx,
  );

  return ordered.map((entry, index) => {
    const standing = ctx.byId.get(entry.id)!;
    return {
      teamId: entry.id,
      rank: index + 1,
      points: standing.points,
      standing,
      tiebreakNote: entry.note,
    };
  });
}
