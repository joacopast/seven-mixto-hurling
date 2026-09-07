/**
 * Generación del fixture de fase de grupos — función pura.
 * Ver docs/arquitectura.html §3 y §9.
 */

export interface RoundRobinPairing {
  /** Fecha del grupo, 1-indexada. */
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

const BYE = "__BYE__";

/**
 * Round-robin por el método del círculo. Para N equipos genera N-1 fechas
 * (N si N es impar, con un "bye" por fecha). Alterna localía por fecha para
 * repartir de forma pareja.
 */
export function generateRoundRobin(teamIds: string[]): RoundRobinPairing[] {
  const teams = [...teamIds];
  if (teams.length < 2) return [];

  if (teams.length % 2 === 1) teams.push(BYE);
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;

  // 1) Emparejamientos por el método del círculo (sin decidir localía todavía).
  const rotation = teams.slice();
  const rawRounds: [string, string][][] = [];
  for (let r = 0; r < rounds; r++) {
    const roundPairs: [string, string][] = [];
    for (let i = 0; i < half; i++) {
      const a = rotation[i]!;
      const b = rotation[n - 1 - i]!;
      if (a === BYE || b === BYE) continue;
      roundPairs.push([a, b]);
    }
    rawRounds.push(roundPairs);
    rotation.splice(1, 0, rotation.pop()!);
  }

  // 2) Asignación de localía: greedy, minimiza el desbalance (máx. 1 partido).
  const homeCount = new Map<string, number>(teamIds.map((t) => [t, 0]));
  const pairings: RoundRobinPairing[] = [];
  for (let r = 0; r < rawRounds.length; r++) {
    for (const [x, y] of rawRounds[r]!) {
      const home = (homeCount.get(x) ?? 0) <= (homeCount.get(y) ?? 0) ? x : y;
      const away = home === x ? y : x;
      homeCount.set(home, (homeCount.get(home) ?? 0) + 1);
      pairings.push({ round: r + 1, homeTeamId: home, awayTeamId: away });
    }
  }

  return pairings;
}

export interface GroupFixtureInput {
  groupId: string;
  groupName: string;
  teamIds: string[];
}

export interface GroupFixtureMatch {
  groupId: string;
  groupName: string;
  groupRound: number;
  homeTeamId: string;
  awayTeamId: string;
}

/** Fixture de todos los grupos (sin horarios ni canchas todavía). */
export function generateGroupFixture(groups: GroupFixtureInput[]): GroupFixtureMatch[] {
  const matches: GroupFixtureMatch[] = [];
  for (const group of groups) {
    for (const p of generateRoundRobin(group.teamIds)) {
      matches.push({
        groupId: group.groupId,
        groupName: group.groupName,
        groupRound: p.round,
        homeTeamId: p.homeTeamId,
        awayTeamId: p.awayTeamId,
      });
    }
  }
  return matches;
}
