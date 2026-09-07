import { describe, it, expect } from "vitest";
import { assignCups, compareGroupStage, type GroupStageRecord } from "@/lib/tournament/cups";

function rec(over: Partial<GroupStageRecord> & Pick<GroupStageRecord, "teamId" | "rank">): GroupStageRecord {
  return { played: 3, points: 6, goalDiff: 0, goalsFor: 5, fairPlayPoints: 0, ...over };
}

describe("assignCups — 16 grupos de 4 (formato del torneo)", () => {
  const records: GroupStageRecord[] = [];
  for (let g = 0; g < 16; g++) {
    for (let r = 1; r <= 4; r++) {
      records.push(
        rec({
          teamId: `g${String(g).padStart(2, "0")}-r${r}`,
          rank: r,
          points: (5 - r) * 3 - g, // que varíe entre grupos
          goalDiff: (5 - r) * 2 - g,
        }),
      );
    }
  }

  const cups = assignCups(records, ["ORO", "PLATA", "BRONCE", "MADERA"]);

  it("crea 4 copas de 16", () => {
    expect(cups).toHaveLength(4);
    expect(cups.every((c) => c.seeds.length === 16)).toBe(true);
  });

  it("cada equipo cae en una sola copa", () => {
    const all = cups.flatMap((c) => c.seeds);
    expect(new Set(all).size).toBe(64);
  });

  it("Oro = todos los 1º, Madera = todos los 4º", () => {
    expect(cups[0]!.seeds.every((id) => id.endsWith("-r1"))).toBe(true);
    expect(cups[3]!.seeds.every((id) => id.endsWith("-r4"))).toBe(true);
  });

  it("los 16 equipos de una copa vienen de 16 grupos distintos (sin revancha posible)", () => {
    for (const cup of cups) {
      const groups = cup.seeds.map((id) => id.split("-")[0]);
      expect(new Set(groups).size).toBe(16);
    }
  });

  it("la siembra respeta el rendimiento en grupos (mejor primero)", () => {
    for (const cup of cups) {
      const seededRecords = cup.seeds.map((id) => records.find((r) => r.teamId === id)!);
      for (let i = 1; i < seededRecords.length; i++) {
        expect(compareGroupStage(seededRecords[i - 1]!, seededRecords[i]!)).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe("compareGroupStage — criterios", () => {
  it("prioriza puntos por partido", () => {
    const a = rec({ teamId: "a", rank: 1, points: 9, played: 3 });
    const b = rec({ teamId: "b", rank: 1, points: 6, played: 3 });
    expect(compareGroupStage(a, b)).toBeLessThan(0);
  });

  it("a igual PPG, decide diferencia de gol", () => {
    const a = rec({ teamId: "a", rank: 1, points: 6, goalDiff: 5 });
    const b = rec({ teamId: "b", rank: 1, points: 6, goalDiff: 2 });
    expect(compareGroupStage(a, b)).toBeLessThan(0);
  });

  it("a igual PPG y DG, decide fair play (menos deméritos)", () => {
    const a = rec({ teamId: "a", rank: 1, points: 6, goalDiff: 3, goalsFor: 4, fairPlayPoints: 1 });
    const b = rec({ teamId: "b", rank: 1, points: 6, goalDiff: 3, goalsFor: 4, fairPlayPoints: 7 });
    expect(compareGroupStage(a, b)).toBeLessThan(0);
  });
});
