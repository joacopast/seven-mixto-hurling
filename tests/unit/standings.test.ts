import { describe, it, expect } from "vitest";
import {
  computeStandings,
  parseWalkoverScore,
  type StandingsConfig,
  type MatchInput,
} from "@/lib/tournament/standings";

const config: StandingsConfig = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  pointsWalkover: 3,
  walkoverScore: "3-0",
};

const [A, B, C, D] = ["A", "B", "C", "D"];

function m(over: Partial<MatchInput> & Pick<MatchInput, "homeTeamId" | "awayTeamId">): MatchInput {
  return {
    status: "FINISHED",
    homeScore: 0,
    awayScore: 0,
    walkoverTeamId: null,
    ...over,
  };
}

describe("parseWalkoverScore", () => {
  it("parsea '3-0'", () => expect(parseWalkoverScore("3-0")).toEqual([3, 0]));
  it("tolera espacios", () => expect(parseWalkoverScore(" 5 - 1 ")).toEqual([5, 1]));
  it("cae a 3-0 si es inválido", () => expect(parseWalkoverScore("xx")).toEqual([3, 0]));
});

describe("computeStandings", () => {
  it("incluye a todos los equipos aunque no hayan jugado", () => {
    const table = computeStandings(config, [A, B, C, D], []);
    expect(table).toHaveLength(4);
    expect(table.every((t) => t.played === 0 && t.points === 0)).toBe(true);
  });

  it("acumula victoria, empate y derrota", () => {
    const table = computeStandings(config, [A, B, C, D], [
      m({ homeTeamId: A, awayTeamId: B, homeScore: 2, awayScore: 1 }),
      m({ homeTeamId: C, awayTeamId: D, homeScore: 0, awayScore: 0 }),
      m({ homeTeamId: A, awayTeamId: C, homeScore: 1, awayScore: 3 }),
    ]);
    const byId = Object.fromEntries(table.map((t) => [t.teamId, t]));
    expect(byId[A]).toMatchObject({ played: 2, won: 1, lost: 1, points: 3, goalsFor: 3, goalsAgainst: 4, goalDiff: -1 });
    expect(byId[B]).toMatchObject({ played: 1, lost: 1, points: 0 });
    expect(byId[C]).toMatchObject({ played: 2, won: 1, drawn: 1, points: 4, goalsFor: 3, goalsAgainst: 1, goalDiff: 2 });
    expect(byId[D]).toMatchObject({ played: 1, drawn: 1, points: 1 });
  });

  it("no cuenta partidos SCHEDULED / IN_PROGRESS / CANCELLED", () => {
    const table = computeStandings(config, [A, B], [
      m({ homeTeamId: A, awayTeamId: B, status: "SCHEDULED", homeScore: 9, awayScore: 0 }),
      m({ homeTeamId: A, awayTeamId: B, status: "CANCELLED" }),
    ]);
    expect(table.every((t) => t.played === 0)).toBe(true);
  });

  it("walkover: el que se presenta gana 3-0 y suma pointsWalkover", () => {
    const table = computeStandings(config, [A, B], [
      m({ homeTeamId: A, awayTeamId: B, status: "WALKOVER", walkoverTeamId: A, homeScore: null, awayScore: null }),
    ]);
    const byId = Object.fromEntries(table.map((t) => [t.teamId, t]));
    expect(byId[A]).toMatchObject({ won: 1, points: 3, goalsFor: 3, goalsAgainst: 0 });
    expect(byId[B]).toMatchObject({ lost: 1, points: 0, goalsFor: 0, goalsAgainst: 3 });
  });

  it("doble ausencia: ambos pierden, sin puntos ni goles", () => {
    const table = computeStandings(config, [A, B], [
      m({ homeTeamId: A, awayTeamId: B, status: "WALKOVER", walkoverTeamId: null }),
    ]);
    expect(table.every((t) => t.played === 1 && t.lost === 1 && t.points === 0 && t.goalsFor === 0)).toBe(true);
  });

  it("suma fair play points del partido", () => {
    const table = computeStandings(config, [A, B], [
      m({ homeTeamId: A, awayTeamId: B, homeScore: 1, awayScore: 1, homeFairPlayPoints: 2, awayFairPlayPoints: 5 }),
    ]);
    const byId = Object.fromEntries(table.map((t) => [t.teamId, t]));
    expect(byId[A]!.fairPlayPoints).toBe(2);
    expect(byId[B]!.fairPlayPoints).toBe(5);
  });

  it("respeta un sistema de puntos configurable", () => {
    const table = computeStandings(
      { ...config, pointsWin: 2, pointsDraw: 1, pointsWalkover: 2 },
      [A, B],
      [m({ homeTeamId: A, awayTeamId: B, homeScore: 3, awayScore: 0 })],
    );
    expect(table.find((t) => t.teamId === A)!.points).toBe(2);
  });
});
