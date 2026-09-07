import { describe, it, expect } from "vitest";
import {
  validateRoster,
  ageOn,
  type RosterConfig,
  type RosterPlayerInput,
} from "@/lib/tournament/roster";

const config: RosterConfig = {
  minPlayers: 7,
  maxPlayers: 20,
  playersOnField: 7,
  maxMenOnField: 3,
  minPlayerAge: 16,
};

const ref = new Date("2026-12-05T12:00:00Z");

function player(over: Partial<RosterPlayerInput> = {}): RosterPlayerInput {
  return {
    firstName: "Ana",
    lastName: "García",
    docNumber: `${Math.floor(Math.random() * 1e8)}`,
    birthDate: new Date("1995-01-01"),
    gender: "F",
    ...over,
  };
}

function roster(n: number, over: Partial<RosterPlayerInput> = {}): RosterPlayerInput[] {
  return Array.from({ length: n }, (_, i) =>
    player({ docNumber: `DOC${i}`, shirtNumber: i + 1, ...over }),
  );
}

describe("ageOn", () => {
  it("calcula edad cumplida", () => {
    expect(ageOn(new Date("2010-12-06T00:00:00Z"), ref)).toBe(15);
    expect(ageOn(new Date("2010-12-05T00:00:00Z"), ref)).toBe(16);
    expect(ageOn(new Date("2010-12-04T00:00:00Z"), ref)).toBe(16);
  });
});

describe("validateRoster — tamaño del plantel", () => {
  it("plantel válido de 12 mixto pasa", () => {
    const players = [
      ...roster(4, { gender: "M", docNumber: "M" }).map((p, i) => ({ ...p, docNumber: `M${i}` })),
      ...roster(8, { gender: "F", docNumber: "F" }).map((p, i) => ({ ...p, docNumber: `F${i}`, shirtNumber: 20 + i })),
    ];
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual({ total: 12, men: 4, women: 8, other: 0 });
  });

  it("menos del mínimo → bloqueante", () => {
    const r = validateRoster(config, roster(6, { gender: "F" }), { referenceDate: ref });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "TOO_FEW_PLAYERS" && i.blocking)).toBe(true);
  });

  it("más del máximo → bloqueante", () => {
    const players = roster(21).map((p, i) => ({
      ...p,
      docNumber: `D${i}`,
      shirtNumber: i + 1,
      gender: (i % 2 === 0 ? "F" : "M") as "F" | "M",
    }));
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "TOO_MANY_PLAYERS")).toBe(true);
  });
});

describe("validateRoster — duplicados", () => {
  it("documento repetido en el equipo → bloqueante", () => {
    const players = roster(8, { gender: "F" }).map((p, i) => ({ ...p, docNumber: "12345678", shirtNumber: i + 1 }));
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.ok).toBe(false);
    expect(r.issues.filter((i) => i.code === "DUPLICATE_DOC").length).toBeGreaterThan(0);
  });

  it("normaliza puntos y guiones al comparar documentos", () => {
    const players = [
      ...roster(6, { gender: "F" }).map((p, i) => ({ ...p, docNumber: `X${i}`, shirtNumber: i + 1 })),
      player({ docNumber: "12.345.678", gender: "M", shirtNumber: 10 }),
      player({ docNumber: "12345678", gender: "M", shirtNumber: 11 }),
    ];
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.issues.some((i) => i.code === "DUPLICATE_DOC")).toBe(true);
  });

  it("número de camiseta repetido → advertencia, no bloqueante", () => {
    const players = roster(8, { gender: "F" }).map((p, i) => ({ ...p, docNumber: `S${i}`, shirtNumber: 7 }));
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.issues.some((i) => i.code === "DUPLICATE_SHIRT" && !i.blocking)).toBe(true);
    // el número repetido por sí solo no bloquea
    expect(r.issues.filter((i) => i.blocking).every((i) => i.code !== "DUPLICATE_SHIRT")).toBe(true);
  });
});

describe("validateRoster — edad", () => {
  it("jugador menor de 16 → bloqueante", () => {
    const players = [
      ...roster(7, { gender: "F" }).map((p, i) => ({ ...p, docNumber: `A${i}`, shirtNumber: i + 1 })),
      player({ birthDate: new Date("2012-01-01"), docNumber: "kid", gender: "M", shirtNumber: 30 }),
    ];
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "UNDERAGE")).toBe(true);
  });
});

describe("validateRoster — composición para cancha (advertencia)", () => {
  it("plantel sin mujeres suficientes para completar la cancha → advertencia no bloqueante", () => {
    const players = roster(8, { gender: "M" }).map((p, i) => ({ ...p, docNumber: `H${i}`, shirtNumber: i + 1 }));
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.issues.some((i) => i.code === "NOT_ENOUGH_WOMEN_FOR_FIELD" && !i.blocking)).toBe(true);
    // 8 jugadores mayores, sin duplicados: no hay bloqueos
    expect(r.ok).toBe(true);
  });

  it("4 mujeres alcanzan para 7 en cancha con máx 3 hombres", () => {
    const players = [
      ...roster(4, { gender: "F" }).map((p, i) => ({ ...p, docNumber: `W${i}`, shirtNumber: i + 1 })),
      ...roster(4, { gender: "M" }).map((p, i) => ({ ...p, docNumber: `M${i}`, shirtNumber: 10 + i })),
    ];
    const r = validateRoster(config, players, { referenceDate: ref });
    expect(r.issues.some((i) => i.code === "NOT_ENOUGH_WOMEN_FOR_FIELD")).toBe(false);
  });
});
