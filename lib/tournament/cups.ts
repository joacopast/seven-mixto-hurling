/**
 * Asignación de copas y siembra — función pura. Ver docs/arquitectura.html §2, §3, §11.
 *
 * Estrategia GROUP_POSITION (default): el 1º de cada grupo va a la copa de mayor
 * jerarquía (Oro), el 2º a la siguiente (Plata), etc. Dentro de cada copa los 16
 * equipos se siembran 1..16 según su rendimiento en la fase de grupos.
 */

export interface GroupStageRecord {
  teamId: string;
  /** Posición final en el grupo (1..N). */
  rank: number;
  played: number;
  points: number;
  goalDiff: number;
  goalsFor: number;
  fairPlayPoints: number;
}

export interface CupAssignment {
  cupName: string;
  /** 1 = copa más alta (Oro). */
  tier: number;
  /** teamIds ordenados por siembra: seeds[0] es el seed 1. */
  seeds: string[];
}

/** Comparador de rendimiento en fase de grupos (mejor primero). */
export function compareGroupStage(a: GroupStageRecord, b: GroupStageRecord): number {
  const ppgA = a.played > 0 ? a.points / a.played : 0;
  const ppgB = b.played > 0 ? b.points / b.played : 0;
  if (ppgA !== ppgB) return ppgB - ppgA;
  if (a.goalDiff !== b.goalDiff) return b.goalDiff - a.goalDiff;
  if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
  if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
  return a.teamId.localeCompare(b.teamId);
}

/**
 * @param records  todos los GroupTeam del torneo, con rank calculado
 * @param cupNames  nombres de las copas de mayor a menor (["ORO","PLATA","BRONCE","MADERA"])
 */
export function assignCups(records: GroupStageRecord[], cupNames: string[]): CupAssignment[] {
  return cupNames.map((cupName, index) => {
    const tierRank = index + 1;
    const seeds = records
      .filter((r) => r.rank === tierRank)
      .sort(compareGroupStage)
      .map((r) => r.teamId);
    return { cupName, tier: tierRank, seeds };
  });
}
