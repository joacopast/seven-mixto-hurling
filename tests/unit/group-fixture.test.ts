import { describe, it, expect } from "vitest";
import { generateRoundRobin, generateGroupFixture } from "@/lib/tournament/group-fixture";

function key(h: string, a: string) {
  return [h, a].sort().join("-");
}

describe("generateRoundRobin", () => {
  it("4 equipos: 3 fechas, 2 partidos por fecha, 6 partidos, cada par una vez", () => {
    const p = generateRoundRobin(["A", "B", "C", "D"]);
    expect(p).toHaveLength(6);
    expect(new Set(p.map((x) => x.round))).toEqual(new Set([1, 2, 3]));
    for (const r of [1, 2, 3]) {
      expect(p.filter((x) => x.round === r)).toHaveLength(2);
    }
    const pairs = new Set(p.map((x) => key(x.homeTeamId, x.awayTeamId)));
    expect(pairs.size).toBe(6);
  });

  it("cada equipo juega exactamente una vez por fecha", () => {
    const p = generateRoundRobin(["A", "B", "C", "D"]);
    for (const round of [1, 2, 3]) {
      const teams = p
        .filter((x) => x.round === round)
        .flatMap((x) => [x.homeTeamId, x.awayTeamId]);
      expect(new Set(teams).size).toBe(4);
    }
  });

  it("cada equipo juega 3 partidos en total", () => {
    const p = generateRoundRobin(["A", "B", "C", "D"]);
    for (const t of ["A", "B", "C", "D"]) {
      expect(p.filter((x) => x.homeTeamId === t || x.awayTeamId === t)).toHaveLength(3);
    }
  });

  it("5 equipos (impar): 5 fechas, cada equipo 4 partidos", () => {
    const p = generateRoundRobin(["A", "B", "C", "D", "E"]);
    expect(new Set(p.map((x) => x.round)).size).toBe(5);
    expect(p).toHaveLength(10);
    for (const t of ["A", "B", "C", "D", "E"]) {
      expect(p.filter((x) => x.homeTeamId === t || x.awayTeamId === t)).toHaveLength(4);
    }
  });

  it("reparte localía de forma pareja en grupos de 4", () => {
    const p = generateRoundRobin(["A", "B", "C", "D"]);
    for (const t of ["A", "B", "C", "D"]) {
      const homeCount = p.filter((x) => x.homeTeamId === t).length;
      expect(homeCount).toBeGreaterThanOrEqual(1);
      expect(homeCount).toBeLessThanOrEqual(2);
    }
  });

  it("menos de 2 equipos: sin partidos", () => {
    expect(generateRoundRobin([])).toEqual([]);
    expect(generateRoundRobin(["A"])).toEqual([]);
  });
});

describe("generateGroupFixture", () => {
  it("16 grupos de 4 → 96 partidos, 3 por equipo", () => {
    const groups = Array.from({ length: 16 }, (_, g) => ({
      groupId: `g${g}`,
      groupName: String.fromCharCode(65 + g),
      teamIds: [0, 1, 2, 3].map((i) => `g${g}-t${i}`),
    }));
    const matches = generateGroupFixture(groups);
    expect(matches).toHaveLength(96);

    const perTeam = new Map<string, number>();
    for (const m of matches) {
      perTeam.set(m.homeTeamId, (perTeam.get(m.homeTeamId) ?? 0) + 1);
      perTeam.set(m.awayTeamId, (perTeam.get(m.awayTeamId) ?? 0) + 1);
    }
    expect([...perTeam.values()].every((n) => n === 3)).toBe(true);
    expect(perTeam.size).toBe(64);
  });
});
