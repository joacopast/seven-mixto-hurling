import { describe, it, expect } from "vitest";
import { computeStandings, type StandingsConfig, type MatchInput } from "@/lib/tournament/standings";
import { rankGroup, DEFAULT_TIEBREAKERS } from "@/lib/tournament/tiebreakers";

const sc: StandingsConfig = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  pointsWalkover: 3,
  walkoverScore: "3-0",
};

const [A, B, C, D] = ["A", "B", "C", "D"];

function fin(h: string, a: string, hs: number, as: number): MatchInput {
  return { homeTeamId: h, awayTeamId: a, status: "FINISHED", homeScore: hs, awayScore: as, walkoverTeamId: null };
}

function rank(matches: MatchInput[], teams = [A, B, C, D], criteria = DEFAULT_TIEBREAKERS) {
  const standings = computeStandings(sc, teams, matches);
  return rankGroup(standings, matches, { standingsConfig: sc, criteria, drawSeed: "grupo-a" });
}

describe("rankGroup — sin empates", () => {
  it("ordena por puntos", () => {
    // A=7 (WWD), B=4 (LWD), C=3 (LLW), D=2 (DDL)
    const r = rank([
      fin(A, B, 3, 0),
      fin(A, C, 1, 0),
      fin(A, D, 2, 2),
      fin(B, C, 2, 1),
      fin(B, D, 0, 0),
      fin(C, D, 4, 0),
    ]);
    expect(r.map((t) => t.teamId)).toEqual([A, B, C, D]);
    expect(r.every((t) => !t.tiebreakNote)).toBe(true);
  });
});

describe("rankGroup — empate de puntos", () => {
  it("desempata dos equipos por enfrentamiento directo", () => {
    // A y B terminan 6 pts; A le ganó a B → A primero, con nota.
    // A: W(B) W(C) L(D) = 6 · B: L(A) W(C) W(D) = 6 · C: L L W(D) = 3 · D: W(A) L L = 3
    const r = rank([
      fin(A, B, 1, 0),
      fin(A, C, 1, 0),
      fin(A, D, 0, 1),
      fin(B, C, 1, 0),
      fin(B, D, 1, 0),
      fin(C, D, 1, 0),
    ]);
    const top2 = r.slice(0, 2).map((t) => t.teamId);
    expect(top2).toEqual([A, B]);
    expect(r[0]!.tiebreakNote).toContain("enfrentamiento directo");
  });

  it("empate de puntos y mismo diferencial → cae a goles a favor", () => {
    // Construimos A y B con 3 pts, GD +1 cada uno, pero A hizo más goles.
    const r = rank(
      [
        fin(A, C, 3, 2), // A: +1, GF 3
        fin(B, C, 1, 0), // B: +1, GF 1
        fin(A, B, 0, 0),
        fin(A, D, 0, 0),
        fin(B, D, 0, 0),
        fin(C, D, 0, 0),
      ],
      [A, B, C, D],
      ["POINTS", "GOAL_DIFF", "GOALS_FOR", "DRAW_LOTS"],
    );
    expect(r[0]!.teamId).toBe(A);
    expect(r[1]!.teamId).toBe(B);
  });

  it("empate total (todo igual) → sorteo determinista y reproducible", () => {
    const matches = [
      fin(A, B, 0, 0),
      fin(A, C, 0, 0),
      fin(B, C, 0, 0),
    ];
    const standings = computeStandings(sc, [A, B, C], matches);
    const r1 = rankGroup(standings, matches, { standingsConfig: sc, drawSeed: "g1" });
    const r2 = rankGroup(standings, matches, { standingsConfig: sc, drawSeed: "g1" });
    expect(r1.map((t) => t.teamId)).toEqual(r2.map((t) => t.teamId));
    expect(r1.every((t) => t.rank >= 1 && t.rank <= 3)).toBe(true);
    expect(new Set(r1.map((t) => t.rank)).size).toBe(3);
    expect(r1.some((t) => t.tiebreakNote?.includes("sorteo"))).toBe(true);
  });

  it("semillas distintas pueden dar órdenes distintos en un empate total", () => {
    const matches = [fin(A, B, 1, 1), fin(A, C, 1, 1), fin(B, C, 1, 1)];
    const standings = computeStandings(sc, [A, B, C], matches);
    const orders = new Set(
      ["s1", "s2", "s3", "s4", "s5"].map((seed) =>
        rankGroup(standings, matches, { standingsConfig: sc, drawSeed: seed })
          .map((t) => t.teamId)
          .join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("rankGroup — empate de 3 equipos", () => {
  it("usa mini-tabla entre los tres empatados", () => {
    // A, B, C empatan a 4 pts (todos le ganaron a D y ciclo entre ellos).
    // Mini-tabla A-B-C: A vence a B, B vence a C, C vence a A → 3 pts c/u,
    // se define por dif. de gol de la mini-tabla.
    const r = rank([
      fin(A, D, 1, 0),
      fin(B, D, 1, 0),
      fin(C, D, 1, 0),
      fin(A, B, 3, 0),
      fin(B, C, 1, 0),
      fin(C, A, 1, 0),
    ]);
    expect(r[3]!.teamId).toBe(D);
    // Mini-tabla A-B-C: los 3 con 3 pts. Dif. de gol: A +2, C 0, B -2.
    expect(r.slice(0, 3).map((t) => t.teamId)).toEqual([A, C, B]);
  });
});

describe("rankGroup — fair play", () => {
  it("desempata por menos deméritos de fair play", () => {
    const matches: MatchInput[] = [
      { homeTeamId: A, awayTeamId: B, status: "FINISHED", homeScore: 0, awayScore: 0, walkoverTeamId: null, homeFairPlayPoints: 1, awayFairPlayPoints: 6 },
      { homeTeamId: A, awayTeamId: C, status: "FINISHED", homeScore: 0, awayScore: 0, walkoverTeamId: null },
      { homeTeamId: B, awayTeamId: C, status: "FINISHED", homeScore: 0, awayScore: 0, walkoverTeamId: null },
    ];
    const standings = computeStandings(sc, [A, B, C], matches);
    const r = rankGroup(standings, matches, {
      standingsConfig: sc,
      criteria: ["POINTS", "GOAL_DIFF", "GOALS_FOR", "FAIR_PLAY", "DRAW_LOTS"],
      drawSeed: "g",
    });
    const posA = r.find((t) => t.teamId === A)!.rank;
    const posB = r.find((t) => t.teamId === B)!.rank;
    expect(posA).toBeLessThan(posB);
    expect(r.find((t) => t.teamId === B)!.tiebreakNote).toContain("fair play");
  });
});
