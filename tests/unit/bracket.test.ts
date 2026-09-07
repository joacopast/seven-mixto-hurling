import { describe, it, expect } from "vitest";
import {
  buildBracket16,
  resolveBracket,
  SEED_ORDER_16,
  ROUND_ORDER,
  type BracketNode,
} from "@/lib/tournament/bracket";

const nodes = buildBracket16();
const byId = new Map(nodes.map((n) => [n.id, n]));

describe("buildBracket16 — estructura", () => {
  it("tiene 15 nodos: 8 + 4 + 2 + 1", () => {
    expect(nodes).toHaveLength(15);
    expect(nodes.filter((n) => n.round === "OCTAVOS")).toHaveLength(8);
    expect(nodes.filter((n) => n.round === "CUARTOS")).toHaveLength(4);
    expect(nodes.filter((n) => n.round === "SEMIS")).toHaveLength(2);
    expect(nodes.filter((n) => n.round === "FINAL")).toHaveLength(1);
  });

  it("los octavos usan los 16 seeds, cada uno una vez", () => {
    const seeds = nodes
      .filter((n) => n.round === "OCTAVOS")
      .flatMap((n) => [Number(n.home.ref), Number(n.away.ref)]);
    expect(seeds.sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
  });

  it("seed 1 y seed 2 solo pueden cruzarse en la final", () => {
    const seed1Oct = nodes.find(
      (n) => n.round === "OCTAVOS" && (n.home.ref === "1" || n.away.ref === "1"),
    )!;
    const seed2Oct = nodes.find(
      (n) => n.round === "OCTAVOS" && (n.home.ref === "2" || n.away.ref === "2"),
    )!;
    // Rastrear a qué semifinal alimenta cada uno.
    const semiOf = (start: BracketNode) => {
      let cur: BracketNode | undefined = start;
      while (cur && cur.round !== "SEMIS") {
        cur = cur.feedsWinnerTo ? byId.get(cur.feedsWinnerTo.nodeId) : undefined;
      }
      return cur?.id;
    };
    expect(semiOf(seed1Oct)).not.toBe(semiOf(seed2Oct));
  });

  it("cada nodo (salvo la final) alimenta a un nodo de la ronda siguiente", () => {
    for (const n of nodes) {
      if (n.round === "FINAL") {
        expect(n.feedsWinnerTo).toBeNull();
      } else {
        expect(n.feedsWinnerTo).not.toBeNull();
        const target = byId.get(n.feedsWinnerTo!.nodeId)!;
        expect(ROUND_ORDER.indexOf(target.round)).toBe(ROUND_ORDER.indexOf(n.round) + 1);
      }
    }
  });

  it("las dos entradas de cada cuartos/semis/final vienen de nodos distintos", () => {
    for (const n of nodes) {
      if (n.round === "OCTAVOS") continue;
      expect(n.home.ref).not.toBe(n.away.ref);
    }
  });
});

describe("resolveBracket", () => {
  const seedToTeam = new Map<number, string>(
    Array.from({ length: 16 }, (_, i) => [i + 1, `team-seed-${i + 1}`]),
  );

  it("sin ganadores: octavos resueltos, rondas siguientes vacías", () => {
    const { resolved, championTeamId } = resolveBracket(nodes, seedToTeam, new Map());
    const octs = resolved.filter((r) => r.round === "OCTAVOS");
    expect(octs.every((r) => r.homeTeamId && r.awayTeamId)).toBe(true);
    expect(resolved.find((r) => r.round === "FINAL")!.homeTeamId).toBeNull();
    expect(championTeamId).toBeNull();
  });

  it("si siempre gana el mejor seed, campeón = seed 1, subcampeón = seed 2", () => {
    const winners = new Map<string, string>();
    // Función: dado un nodo, el ganador es el equipo de menor seed.
    const seedOf = (teamId: string) => Number(teamId.replace("team-seed-", ""));
    for (const round of ROUND_ORDER) {
      for (const n of nodes.filter((x) => x.round === round)) {
        const { resolved } = resolveBracket(nodes, seedToTeam, winners);
        const rn = resolved.find((r) => r.id === n.id)!;
        const better =
          seedOf(rn.homeTeamId!) < seedOf(rn.awayTeamId!) ? rn.homeTeamId! : rn.awayTeamId!;
        winners.set(n.id, better);
      }
    }
    const out = resolveBracket(nodes, seedToTeam, winners);
    expect(out.championTeamId).toBe("team-seed-1");
    expect(out.runnerUpTeamId).toBe("team-seed-2");
    expect(out.semifinalLoserTeamIds).toHaveLength(2);
  });

  it("propaga upsets: si el seed 16 gana todo, es campeón", () => {
    const winners = new Map<string, string>();
    for (const round of ROUND_ORDER) {
      for (const n of nodes.filter((x) => x.round === round)) {
        const { resolved } = resolveBracket(nodes, seedToTeam, winners);
        const rn = resolved.find((r) => r.id === n.id)!;
        winners.set(
          n.id,
          rn.homeTeamId === "team-seed-16" || rn.awayTeamId === "team-seed-16"
            ? "team-seed-16"
            : rn.homeTeamId!,
        );
      }
    }
    expect(resolveBracket(nodes, seedToTeam, winners).championTeamId).toBe("team-seed-16");
  });
});

describe("SEED_ORDER_16", () => {
  it("es una permutación de 1..16", () => {
    expect([...SEED_ORDER_16].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
  });
});
