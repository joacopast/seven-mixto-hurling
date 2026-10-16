import { describe, it, expect } from "vitest";
import { scheduleMatches, type SchedulableMatch } from "@/lib/tournament/scheduler";
import { generateGroupFixture } from "@/lib/tournament/group-fixture";

const config = {
  fieldCount: 6,
  matchDurationMin: 15,
  turnoverMin: 5,
  startsAt: new Date("2026-12-06T08:00:00-03:00"),
};

function toSchedulable() {
  const groups = Array.from({ length: 16 }, (_, g) => ({
    groupId: `g${g}`,
    groupName: String.fromCharCode(65 + g),
    teamIds: [0, 1, 2, 3].map((i) => `g${g}-t${i}`),
  }));
  return generateGroupFixture(groups).map<SchedulableMatch>((m, i) => ({
    ref: `m${i}`,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    unitKey: `${m.groupId}:${m.groupRound}`,
    order: m.groupRound,
  }));
}

describe("scheduleMatches — fase de grupos 64 equipos", () => {
  const schedule = scheduleMatches(config, toSchedulable());

  it("programa los 96 partidos", () => {
    expect(schedule.matches).toHaveLength(96);
  });

  it("usa exactamente 16 tandas (96 / 6 canchas)", () => {
    expect(schedule.tandaCount).toBe(16);
  });

  it("nunca pone más de 6 partidos en una tanda", () => {
    const perTanda = new Map<number, number>();
    for (const m of schedule.matches) perTanda.set(m.tanda, (perTanda.get(m.tanda) ?? 0) + 1);
    expect([...perTanda.values()].every((n) => n <= 6)).toBe(true);
  });

  it("ningún equipo juega dos veces en la misma tanda", () => {
    const perTanda = new Map<number, Set<string>>();
    for (const m of schedule.matches) {
      const set = perTanda.get(m.tanda) ?? new Set();
      expect(set.has(m.homeTeamId)).toBe(false);
      expect(set.has(m.awayTeamId)).toBe(false);
      set.add(m.homeTeamId);
      set.add(m.awayTeamId);
      perTanda.set(m.tanda, set);
    }
  });

  it("los partidos de una misma grupo-fecha caen en la misma tanda", () => {
    const byUnit = new Map<string, Set<number>>();
    for (const m of schedule.matches) {
      const s = byUnit.get(m.unitKey) ?? new Set();
      s.add(m.tanda);
      byUnit.set(m.unitKey, s);
    }
    expect([...byUnit.values()].every((s) => s.size === 1)).toBe(true);
  });

  it("asigna canchas 1..6 sin repetir dentro de una tanda", () => {
    const perTanda = new Map<number, number[]>();
    for (const m of schedule.matches) {
      const arr = perTanda.get(m.tanda) ?? [];
      arr.push(m.field);
      perTanda.set(m.tanda, arr);
      expect(m.field).toBeGreaterThanOrEqual(1);
      expect(m.field).toBeLessThanOrEqual(6);
    }
    for (const arr of perTanda.values()) {
      expect(new Set(arr).size).toBe(arr.length);
    }
  });

  it("las tandas arrancan cada 20 minutos", () => {
    expect(schedule.tandaStartTimes[0]!.toISOString()).toBe(config.startsAt.toISOString());
    const diff =
      schedule.tandaStartTimes[1]!.getTime() - schedule.tandaStartTimes[0]!.getTime();
    expect(diff).toBe(20 * 60_000);
  });

  it("cada equipo tiene sus 3 partidos en 3 tandas distintas", () => {
    const perTeam = new Map<string, Set<number>>();
    for (const m of schedule.matches) {
      for (const t of [m.homeTeamId, m.awayTeamId]) {
        const s = perTeam.get(t) ?? new Set();
        s.add(m.tanda);
        perTeam.set(t, s);
      }
    }
    expect([...perTeam.values()].every((s) => s.size === 3)).toBe(true);
  });
});

describe("scheduleMatches — configurable", () => {
  it("con 8 canchas la fase de grupos entra en 12 tandas", () => {
    const schedule = scheduleMatches({ ...config, fieldCount: 8 }, toSchedulable());
    expect(schedule.tandaCount).toBe(12);
  });

  it("lanza si una unidad tiene más partidos que canchas", () => {
    const big: SchedulableMatch[] = Array.from({ length: 4 }, (_, i) => ({
      ref: `x${i}`,
      homeTeamId: `h${i}`,
      awayTeamId: `a${i}`,
      unitKey: "same",
      order: 1,
    }));
    expect(() => scheduleMatches({ ...config, fieldCount: 3 }, big)).toThrow();
  });
});

describe("scheduleMatches — pausa de riego", () => {
  it("sin waterBreak no inserta pausas", () => {
    const schedule = scheduleMatches(config, toSchedulable());
    const diff = schedule.tandaStartTimes[1]!.getTime() - schedule.tandaStartTimes[0]!.getTime();
    expect(diff).toBe(20 * 60_000);
  });

  it("inserta la pausa cada N tandas y corre el resto en cascada", () => {
    const schedule = scheduleMatches(
      { ...config, waterBreak: { everyTandas: 4, minutes: 7 } },
      toSchedulable(),
    );
    const slotMs = 20 * 60_000;
    // Tandas 0-3 sin pausa todavía.
    for (let i = 0; i < 4; i++) {
      expect(schedule.tandaStartTimes[i]!.getTime()).toBe(config.startsAt.getTime() + i * slotMs);
    }
    // La tanda 4 (la 5ta) arranca con +7min de pausa ya acumulados.
    expect(schedule.tandaStartTimes[4]!.getTime()).toBe(
      config.startsAt.getTime() + 4 * slotMs + 7 * 60_000,
    );
    // La tanda 8 (la 9na) ya acumuló 2 pausas (14 min).
    expect(schedule.tandaStartTimes[8]!.getTime()).toBe(
      config.startsAt.getTime() + 8 * slotMs + 14 * 60_000,
    );
  });

  it("tandasBefore hace que el conteo siga entre llamadas (ej. entre fases)", () => {
    // Si ya pasaron 3 tandas antes de esta llamada, la 1ra tanda de esta
    // llamada (índice 0, pero es la 4ta global) completa el ciclo de 4 y
    // la 2da (índice 1, 5ta global) ya arranca con la pausa.
    const schedule = scheduleMatches(
      { ...config, waterBreak: { everyTandas: 4, minutes: 7 }, tandasBefore: 3 },
      toSchedulable(),
    );
    const slotMs = 20 * 60_000;
    expect(schedule.tandaStartTimes[0]!.getTime()).toBe(config.startsAt.getTime());
    expect(schedule.tandaStartTimes[1]!.getTime()).toBe(
      config.startsAt.getTime() + 1 * slotMs + 7 * 60_000,
    );
    expect(schedule.tandasElapsed).toBe(3 + schedule.tandaCount);
  });

  it("everyTandas en 0 desactiva la pausa aunque minutes esté seteado", () => {
    const schedule = scheduleMatches(
      { ...config, waterBreak: { everyTandas: 0, minutes: 7 } },
      toSchedulable(),
    );
    const diff = schedule.tandaStartTimes[5]!.getTime() - schedule.tandaStartTimes[4]!.getTime();
    expect(diff).toBe(20 * 60_000);
  });
});
