/**
 * Llave de eliminación directa — función pura. Ver docs/arquitectura.html §3, §11, §15.
 *
 * Optimizada para copas de 16 (Octavos → Cuartos → Semifinal → Final) pero el
 * generador soporta cualquier potencia de 2. Sin partido por el 3er puesto
 * (decisión de la organización): los perdedores de semifinal comparten el 3º.
 */

export type BracketRoundName = "OCTAVOS" | "CUARTOS" | "SEMIS" | "FINAL";

export const ROUND_ORDER: BracketRoundName[] = ["OCTAVOS", "CUARTOS", "SEMIS", "FINAL"];

export const ROUND_LABEL: Record<BracketRoundName, string> = {
  OCTAVOS: "Octavos",
  CUARTOS: "Cuartos",
  SEMIS: "Semifinal",
  FINAL: "Final",
};

const ROUND_BY_MATCH_COUNT: Record<number, BracketRoundName> = {
  8: "OCTAVOS",
  4: "CUARTOS",
  2: "SEMIS",
  1: "FINAL",
};

/**
 * Orden de siembra canónico para una llave de `size` (potencia de 2).
 * size 4 → [1,4,2,3] · size 8 → [1,8,4,5,2,7,3,6] · size 16 → [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]
 */
export function seedOrder(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`seedOrder: el tamaño de la llave debe ser una potencia de 2 (recibió ${size}).`);
  }
  if (size === 1) return [1];
  const prev = seedOrder(size / 2);
  const out: number[] = [];
  for (const s of prev) {
    out.push(s);
    out.push(size + 1 - s);
  }
  return out;
}

export const SEED_ORDER_16 = seedOrder(16);

export type SourceType = "SEED" | "WINNER_OF";

export interface BracketNode {
  /** id local estable: `${round}-${slot}`. */
  id: string;
  round: BracketRoundName;
  slot: number;
  home: { type: SourceType; ref: string };
  away: { type: SourceType; ref: string };
  /** A dónde va el ganador. null solo para la final. */
  feedsWinnerTo: { nodeId: string; side: "home" | "away" } | null;
}

const nodeId = (round: BracketRoundName, slot: number) => `${round}-${slot}`;

/** Estructura de una llave single-elimination (sin 3er puesto). */
export function buildSingleElimBracket(size: number): BracketNode[] {
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error(`El tamaño de la llave debe ser potencia de 2 (recibido ${size}).`);
  }

  const rounds: BracketRoundName[] = [];
  for (let m = size / 2; m >= 1; m /= 2) {
    const name = ROUND_BY_MATCH_COUNT[m];
    if (!name) throw new Error(`Llave demasiado grande (${size}).`);
    rounds.push(name);
  }

  const order = seedOrder(size);
  const nodes: BracketNode[] = [];

  rounds.forEach((round, roundIdx) => {
    const matchesInRound = size / 2 ** (roundIdx + 1);
    for (let slot = 0; slot < matchesInRound; slot++) {
      const isFirst = roundIdx === 0;
      const nextRound = rounds[roundIdx + 1];
      nodes.push({
        id: nodeId(round, slot),
        round,
        slot,
        home: isFirst
          ? { type: "SEED", ref: String(order[slot * 2]) }
          : { type: "WINNER_OF", ref: nodeId(rounds[roundIdx - 1]!, slot * 2) },
        away: isFirst
          ? { type: "SEED", ref: String(order[slot * 2 + 1]) }
          : { type: "WINNER_OF", ref: nodeId(rounds[roundIdx - 1]!, slot * 2 + 1) },
        feedsWinnerTo: nextRound
          ? { nodeId: nodeId(nextRound, Math.floor(slot / 2)), side: slot % 2 === 0 ? "home" : "away" }
          : null,
      });
    }
  });

  return nodes;
}

/** Atajo para la copa estándar de 16. */
export const buildBracket16 = () => buildSingleElimBracket(16);

/**
 * Ajusta los cruces de primera ronda para evitar repetir un enfrentamiento del
 * mismo grupo. Para el formato "1º de cada grupo → una copa" nunca hay dos
 * equipos del mismo grupo en una copa, así que normalmente es un no-op.
 */
export function avoidSameGroupOctavos(seeds: string[], groupOf: Map<string, string>): string[] {
  const size = seeds.length;
  const result = [...seeds];
  const order = seedOrder(size);
  const teamAt = (bracketIndex: number) => result[order[bracketIndex]! - 1]!;

  for (let pair = 0; pair < size / 2; pair++) {
    const a = teamAt(pair * 2);
    const b = teamAt(pair * 2 + 1);
    if (groupOf.get(a) && groupOf.get(a) === groupOf.get(b)) {
      for (const alt of [pair * 2 + 3, pair * 2 - 1, pair * 2 + 5]) {
        if (alt < 0 || alt >= size) continue;
        const c = teamAt(alt);
        const partner = teamAt(alt % 2 === 0 ? alt + 1 : alt - 1);
        if (groupOf.get(c) !== groupOf.get(a) && groupOf.get(c) !== groupOf.get(partner)) {
          const bi = order[pair * 2 + 1]! - 1;
          const ci = order[alt]! - 1;
          [result[bi], result[ci]] = [result[ci]!, result[bi]!];
          break;
        }
      }
    }
  }
  return result;
}

export interface ResolvedNode {
  id: string;
  round: BracketRoundName;
  slot: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  winnerTeamId: string | null;
}

/** Resuelve los equipos de cada nodo a partir de la siembra y los ganadores conocidos. */
export function resolveBracket(
  nodes: BracketNode[],
  seedToTeam: Map<number, string>,
  winners: Map<string, string>,
): {
  resolved: ResolvedNode[];
  championTeamId: string | null;
  runnerUpTeamId: string | null;
  semifinalLoserTeamIds: string[];
} {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const teamCache = new Map<string, string | null>();

  const teamFor = (source: { type: SourceType; ref: string }): string | null => {
    if (source.type === "SEED") return seedToTeam.get(Number(source.ref)) ?? null;
    if (teamCache.has(source.ref)) return teamCache.get(source.ref)!;
    const w = winners.get(source.ref) ?? null;
    teamCache.set(source.ref, w);
    return w;
  };

  const resolved: ResolvedNode[] = nodes.map((n) => ({
    id: n.id,
    round: n.round,
    slot: n.slot,
    homeTeamId: teamFor(n.home),
    awayTeamId: teamFor(n.away),
    winnerTeamId: winners.get(n.id) ?? null,
  }));

  const finalNode = nodes.find((n) => n.round === "FINAL")!;
  const finalWinner = winners.get(finalNode.id) ?? null;
  const finalHome = teamFor(finalNode.home);
  const finalAway = teamFor(finalNode.away);
  const runnerUp =
    finalWinner && finalHome && finalAway
      ? finalWinner === finalHome
        ? finalAway
        : finalHome
      : null;

  const semiLosers: string[] = [];
  for (const semi of nodes.filter((n) => n.round === "SEMIS")) {
    const w = winners.get(semi.id);
    const h = teamFor(semi.home);
    const a = teamFor(semi.away);
    if (w && h && a) semiLosers.push(w === h ? a : h);
  }
  // Si no hay semifinales (llave de 2), no hay 3er puesto.
  void byId;

  return {
    resolved,
    championTeamId: finalWinner,
    runnerUpTeamId: runnerUp,
    semifinalLoserTeamIds: semiLosers,
  };
}
