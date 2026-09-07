/**
 * Tabla de posiciones — función pura. Ver docs/arquitectura.html §3 y §10.
 * Sin dependencias de Prisma ni framework.
 */

export interface StandingsConfig {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  /** Puntos para el equipo que gana por no presentación del rival. */
  pointsWalkover: number;
  /** Resultado que se computa en un walkover, ej. "3-0". */
  walkoverScore: string;
}

export type MatchComputeStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "FINISHED"
  | "WALKOVER"
  | "CANCELLED";

export interface MatchInput {
  homeTeamId: string;
  awayTeamId: string;
  status: MatchComputeStatus;
  homeScore: number | null;
  awayScore: number | null;
  /** En un walkover: el equipo que se presentó (ganador). null = doble ausencia. */
  walkoverTeamId?: string | null;
  /** Demérito de fair play cargado en el partido (tarjetas, etc.). */
  homeFairPlayPoints?: number;
  awayFairPlayPoints?: number;
}

export interface TeamStanding {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  fairPlayPoints: number;
}

export function parseWalkoverScore(score: string): [number, number] {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec(score.trim());
  if (!m) return [3, 0];
  return [Number(m[1]), Number(m[2])];
}

function emptyStanding(teamId: string): TeamStanding {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0,
    fairPlayPoints: 0,
  };
}

/** Estados de partido que cuentan para la tabla. */
export function isCounted(status: MatchComputeStatus): boolean {
  return status === "FINISHED" || status === "WALKOVER";
}

/**
 * Calcula la tabla de un grupo a partir de sus partidos.
 * `teamIds` fija el universo de equipos (para que aparezcan con 0 los que no jugaron).
 */
export function computeStandings(
  config: StandingsConfig,
  teamIds: string[],
  matches: MatchInput[],
): TeamStanding[] {
  const table = new Map<string, TeamStanding>();
  for (const id of teamIds) table.set(id, emptyStanding(id));

  const ensure = (id: string): TeamStanding => {
    let s = table.get(id);
    if (!s) {
      s = emptyStanding(id);
      table.set(id, s);
    }
    return s;
  };

  const [woWin, woLose] = parseWalkoverScore(config.walkoverScore);

  for (const match of matches) {
    if (!isCounted(match.status)) continue;
    const home = ensure(match.homeTeamId);
    const away = ensure(match.awayTeamId);

    home.fairPlayPoints += match.homeFairPlayPoints ?? 0;
    away.fairPlayPoints += match.awayFairPlayPoints ?? 0;

    if (match.status === "WALKOVER") {
      if (!match.walkoverTeamId) {
        // Doble ausencia: cuenta como jugado y perdido para ambos, sin puntos ni goles.
        home.played++;
        away.played++;
        home.lost++;
        away.lost++;
        home.points += config.pointsLoss;
        away.points += config.pointsLoss;
        continue;
      }
      const winner = match.walkoverTeamId === match.homeTeamId ? home : away;
      const loser = winner === home ? away : home;
      winner.played++;
      loser.played++;
      winner.won++;
      loser.lost++;
      winner.goalsFor += woWin;
      winner.goalsAgainst += woLose;
      loser.goalsFor += woLose;
      loser.goalsAgainst += woWin;
      winner.points += config.pointsWalkover;
      loser.points += config.pointsLoss;
      continue;
    }

    // FINISHED
    const hs = match.homeScore ?? 0;
    const as = match.awayScore ?? 0;
    home.played++;
    away.played++;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;

    if (hs > as) {
      home.won++;
      away.lost++;
      home.points += config.pointsWin;
      away.points += config.pointsLoss;
    } else if (hs < as) {
      away.won++;
      home.lost++;
      away.points += config.pointsWin;
      home.points += config.pointsLoss;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += config.pointsDraw;
      away.points += config.pointsDraw;
    }
  }

  for (const s of table.values()) {
    s.goalDiff = s.goalsFor - s.goalsAgainst;
  }

  // Orden inicial estable por id (el ranking real lo resuelve rankGroup).
  return [...table.values()].sort((a, b) => a.teamId.localeCompare(b.teamId));
}
