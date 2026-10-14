import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament, seedConfirmedTeams } from "../helpers/db";
import {
  saveGroupAssignment,
  generateGroupPhaseFixture,
  setTournamentStatus,
} from "@/lib/services/groups";
import { setGroupMatchResult } from "@/lib/services/results";
import { generateCups, setCupMatchResult, CupsError } from "@/lib/services/cups";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$disconnect();
});

/** 16 equipos, 4 grupos de 4, fase de grupos jugada entera. */
async function playGroupPhase() {
  const t = await seedTournament();
  await testDb.tournamentConfig.updateMany({
    where: { tournamentId: t.id },
    data: { groupCount: 4, groupSize: 4, fieldCount: 4 },
  });
  const teams = await seedConfirmedTeams(t.id, 16);
  await setTournamentStatus(t.id, "REGISTRATION_CLOSED");

  const groups = [
    teams.slice(0, 4),
    teams.slice(4, 8),
    teams.slice(8, 12),
    teams.slice(12, 16),
  ].map((g) => g.map((x) => x.id));
  await saveGroupAssignment(t.id, groups);
  await generateGroupPhaseFixture(t.id);
  await setTournamentStatus(t.id, "GROUPS_PUBLISHED");

  // Resultado de cada partido: gana el equipo cuyo id es "menor" (determinista).
  const matches = await testDb.match.findMany({
    where: { tournamentId: t.id, phase: "GROUP" },
    orderBy: { createdAt: "asc" },
  });
  for (const m of matches) {
    const homeWins = m.homeTeamId! < m.awayTeamId!;
    await setGroupMatchResult(m.id, { homeScore: homeWins ? 2 : 0, awayScore: homeWins ? 0 : 2 });
  }
  return { t, teams };
}

describe("generateCups", () => {
  it("crea 4 copas de 4 con sus llaves (Semifinal + Final)", async () => {
    const { t } = await playGroupPhase();
    const res = await generateCups(t.id);

    expect(res.cups.map((c) => c.name)).toEqual(["ORO", "PLATA", "BRONCE", "MADERA"]);
    expect(res.cups.every((c) => c.teams === 4)).toBe(true);

    const tournament = await testDb.tournament.findUnique({ where: { id: t.id } });
    expect(tournament!.status).toBe("CUPS_PUBLISHED");

    const cups = await testDb.cup.findMany({
      where: { tournamentId: t.id },
      include: { bracket: { include: { matches: { include: { match: true } } } } },
    });
    expect(cups).toHaveLength(4);
    for (const cup of cups) {
      const bms = cup.bracket!.matches;
      expect(bms.filter((b) => b.round === "SEMIS")).toHaveLength(2);
      expect(bms.filter((b) => b.round === "FINAL")).toHaveLength(1);
      // Semis con equipos ya definidos.
      for (const semi of bms.filter((b) => b.round === "SEMIS")) {
        expect(semi.match!.homeTeamId).toBeTruthy();
        expect(semi.match!.awayTeamId).toBeTruthy();
      }
      // Final sin equipos todavía.
      const final = bms.find((b) => b.round === "FINAL")!;
      expect(final.match!.homeTeamId).toBeNull();
    }
  });

  it("Oro contiene a los 4 primeros de grupo; cada equipo tiene cupId", async () => {
    const { t } = await playGroupPhase();
    await generateCups(t.id);

    const firsts = await testDb.groupTeam.findMany({ where: { group: { tournamentId: t.id }, rank: 1 } });
    const oro = await testDb.cup.findFirst({ where: { tournamentId: t.id, name: "ORO" } });
    const oroTeams = await testDb.team.findMany({ where: { cupId: oro!.id } });
    expect(new Set(oroTeams.map((x) => x.id))).toEqual(new Set(firsts.map((f) => f.teamId)));

    const withoutCup = await testDb.team.count({ where: { tournamentId: t.id, cupId: null } });
    expect(withoutCup).toBe(0);
  });

  it("agenda las rondas de copa después de la fase de grupos", async () => {
    const { t } = await playGroupPhase();
    await generateCups(t.id);
    const groupRounds = await testDb.round.findMany({ where: { tournamentId: t.id, phase: "GROUP" } });
    const cupRounds = await testDb.round.findMany({ where: { tournamentId: t.id, phase: "CUP" }, orderBy: { startsAt: "asc" } });
    const lastGroup = Math.max(...groupRounds.map((r) => r.startsAt.getTime()));
    expect(cupRounds[0]!.startsAt.getTime()).toBeGreaterThan(lastGroup);
    // Semis antes que finales.
    const semiRound = cupRounds.find((r) => r.label.includes("Semifinal"));
    const finalRound = cupRounds.find((r) => r.label.includes("Final"));
    expect(semiRound!.startsAt.getTime()).toBeLessThan(finalRound!.startsAt.getTime());
  });

  it("rechaza generar si faltan resultados de grupos", async () => {
    const t = await seedTournament();
    await testDb.tournamentConfig.updateMany({ where: { tournamentId: t.id }, data: { groupCount: 4, groupSize: 4, fieldCount: 4 } });
    const teams = await seedConfirmedTeams(t.id, 16);
    await setTournamentStatus(t.id, "REGISTRATION_CLOSED");
    await saveGroupAssignment(t.id, [teams.slice(0,4), teams.slice(4,8), teams.slice(8,12), teams.slice(12,16)].map((g) => g.map((x) => x.id)));
    await generateGroupPhaseFixture(t.id);
    await setTournamentStatus(t.id, "GROUPS_PUBLISHED");

    await expect(generateCups(t.id)).rejects.toMatchObject({ code: "GROUPS_NOT_FINISHED" });
  });

  it("rechaza con error claro si los grupos tienen distinta cantidad de equipos (no crashea)", async () => {
    // Reproduce un bug real: 2 grupos (potencia de 2 ✓) pero de tamaño distinto —
    // la copa más baja queda con 0 seeds y seedOrder(0) recursaba infinito.
    const t = await seedTournament();
    await testDb.tournamentConfig.updateMany({
      where: { tournamentId: t.id },
      data: { groupCount: 2, groupSize: 4, fieldCount: 2 },
    });
    const teams = await seedConfirmedTeams(t.id, 5);
    await setTournamentStatus(t.id, "REGISTRATION_CLOSED");
    await saveGroupAssignment(t.id, [teams.slice(0, 3), teams.slice(3, 5)].map((g) => g.map((x) => x.id)));
    await generateGroupPhaseFixture(t.id);
    await setTournamentStatus(t.id, "GROUPS_PUBLISHED");

    const matches = await testDb.match.findMany({ where: { tournamentId: t.id, phase: "GROUP" } });
    for (const m of matches) {
      const homeWins = m.homeTeamId! < m.awayTeamId!;
      await setGroupMatchResult(m.id, { homeScore: homeWins ? 2 : 0, awayScore: homeWins ? 0 : 2 });
    }

    await expect(generateCups(t.id)).rejects.toMatchObject({ code: "WRONG_STATUS" });
    await expect(generateCups(t.id)).rejects.toThrow(/misma cantidad de equipos/);
  });
});

describe("setCupMatchResult — avance de la llave", () => {
  async function withCups() {
    const { t } = await playGroupPhase();
    await generateCups(t.id);
    const oro = await testDb.cup.findFirstOrThrow({ where: { tournamentId: t.id, name: "ORO" } });
    const bracket = await testDb.bracket.findFirstOrThrow({ where: { cupId: oro.id } });
    const bms = await testDb.bracketMatch.findMany({
      where: { bracketId: bracket.id },
      include: { match: true },
    });
    const semis = bms.filter((b) => b.round === "SEMIS").sort((a, b) => a.bracketSlot - b.bracketSlot);
    const final = bms.find((b) => b.round === "FINAL")!;
    return { t, oro, semis, final };
  }

  it("el ganador de semifinal avanza a la final", async () => {
    const { semis, final } = await withCups();
    const s0 = semis[0]!.match!;
    await setCupMatchResult(s0.id, { homeScore: 3, awayScore: 1 });

    const updatedFinal = await testDb.match.findUnique({ where: { id: final.match!.id } });
    expect(updatedFinal!.homeTeamId).toBe(s0.homeTeamId);
    expect(updatedFinal!.awayTeamId).toBeNull();
  });

  it("empate en copa exige definición por penales", async () => {
    const { semis } = await withCups();
    await expect(
      setCupMatchResult(semis[0]!.match!.id, { homeScore: 1, awayScore: 1 }),
    ).rejects.toMatchObject({ code: "BAD_INPUT" });

    await setCupMatchResult(semis[0]!.match!.id, {
      homeScore: 1,
      awayScore: 1,
      homeShootout: 4,
      awayShootout: 2,
    });
    const m = await testDb.match.findUnique({ where: { id: semis[0]!.match!.id } });
    expect(m!.winnerTeamId).toBe(semis[0]!.match!.homeTeamId);
  });

  it("completar la final marca campeón, subcampeón, 3os y termina el torneo", async () => {
    const { t, oro, semis, final } = await withCups();
    // Jugar las dos semis de las 4 copas + finales.
    const allCups = await testDb.cup.findMany({ where: { tournamentId: t.id } });
    for (const cup of allCups) {
      const b = await testDb.bracket.findFirstOrThrow({ where: { cupId: cup.id } });
      const bms = await testDb.bracketMatch.findMany({ where: { bracketId: b.id }, include: { match: true }, orderBy: { bracketSlot: "asc" } });
      for (const semi of bms.filter((x) => x.round === "SEMIS")) {
        await setCupMatchResult(semi.match!.id, { homeScore: 2, awayScore: 0 });
      }
      const fresh = await testDb.match.findUniqueOrThrow({
        where: { id: bms.find((x) => x.round === "FINAL")!.match!.id },
      });
      await setCupMatchResult(fresh.id, { homeScore: 1, awayScore: 0 });
    }

    const tournament = await testDb.tournament.findUnique({ where: { id: t.id } });
    expect(tournament!.status).toBe("FINISHED");

    const finalMatch = await testDb.match.findUniqueOrThrow({ where: { id: final.match!.id } });
    const champ = await testDb.team.findUniqueOrThrow({ where: { id: finalMatch.winnerTeamId! } });
    expect(champ.finalPosition).toBe(1);

    const thirds = await testDb.team.count({ where: { cupId: oro.id, finalPosition: 3 } });
    expect(thirds).toBe(2);
    void semis;
  });

  it("corregir una semifinal ya propagada exige confirmar la cascada", async () => {
    const { semis, final } = await withCups();
    const s0 = semis[0]!.match!;
    const s1 = semis[1]!.match!;
    await setCupMatchResult(s0.id, { homeScore: 2, awayScore: 0 }); // gana home de s0
    await setCupMatchResult(s1.id, { homeScore: 2, awayScore: 0 });
    // La final ya tiene 2 equipos; jugarla.
    const finalFresh = await testDb.match.findUniqueOrThrow({ where: { id: final.match!.id } });
    await setCupMatchResult(finalFresh.id, { homeScore: 1, awayScore: 0 });

    // Corregir s0 → ahora gana el visitante. Debe pedir confirmación.
    await expect(
      setCupMatchResult(s0.id, { homeScore: 0, awayScore: 3 }),
    ).rejects.toMatchObject({ code: "NEEDS_CASCADE_CONFIRM" });

    await setCupMatchResult(s0.id, { homeScore: 0, awayScore: 3 }, { confirmCascade: true });

    const finalAfter = await testDb.match.findUniqueOrThrow({ where: { id: final.match!.id } });
    expect(finalAfter.homeTeamId).toBe(s0.awayTeamId);
    expect(finalAfter.status).toBe("SCHEDULED");
    expect(finalAfter.winnerTeamId).toBeNull();
  });
});
