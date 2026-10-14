import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament, seedConfirmedTeams } from "../helpers/db";
import {
  saveGroupAssignment,
  generateGroupPhaseFixture,
  setTournamentStatus,
} from "@/lib/services/groups";
import { setGroupMatchResult } from "@/lib/services/results";
import { generateCups, setCupMatchResult } from "@/lib/services/cups";
import { resetTournament } from "@/lib/services/reset";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$disconnect();
});

/** Torneo completo: 16 equipos, 4 grupos, fase de grupos + las 4 copas jugadas hasta el final. */
async function playFullTournament() {
  const t = await seedTournament();
  await testDb.tournamentConfig.updateMany({
    where: { tournamentId: t.id },
    data: { groupCount: 4, groupSize: 4, fieldCount: 4 },
  });
  const teams = await seedConfirmedTeams(t.id, 16, { playersPerTeam: 8 });
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

  const groupMatches = await testDb.match.findMany({ where: { tournamentId: t.id, phase: "GROUP" } });
  for (const m of groupMatches) {
    const homeWins = m.homeTeamId! < m.awayTeamId!;
    await setGroupMatchResult(m.id, { homeScore: homeWins ? 2 : 0, awayScore: homeWins ? 0 : 2 });
  }

  await generateCups(t.id);
  // Jugar semis + final de cada copa.
  const cups = await testDb.cup.findMany({ where: { tournamentId: t.id } });
  for (const cup of cups) {
    const b = await testDb.bracket.findFirstOrThrow({ where: { cupId: cup.id } });
    const bms = await testDb.bracketMatch.findMany({
      where: { bracketId: b.id },
      include: { match: true },
      orderBy: { bracketSlot: "asc" },
    });
    for (const semi of bms.filter((x) => x.round === "SEMIS")) {
      await setCupMatchResult(semi.match!.id, { homeScore: 2, awayScore: 0 });
    }
    const finalBm = bms.find((x) => x.round === "FINAL")!;
    const fresh = await testDb.match.findUniqueOrThrow({ where: { id: finalBm.match!.id } });
    await setCupMatchResult(fresh.id, { homeScore: 1, awayScore: 0 });
  }

  // Un pago manual y una notificación, para probar que también se limpian.
  const reg = await testDb.registration.findFirstOrThrow({ where: { tournamentId: t.id } });
  await testDb.payment.create({
    data: { registrationId: reg.id, provider: "MANUAL_TRANSFER", status: "APPROVED", amount: 100 },
  });
  await testDb.notification.create({
    data: {
      type: "TEAM_APPROVED",
      recipientTeamId: teams[0]!.id,
      payload: { test: true },
    },
  });

  return { t, teams };
}

describe("resetTournament", () => {
  it("borra todos los datos del torneo y lo deja listo para una edición nueva", async () => {
    const { t, teams } = await playFullTournament();

    const before = {
      teams: await testDb.team.count({ where: { tournamentId: t.id } }),
      matches: await testDb.match.count({ where: { tournamentId: t.id } }),
      groups: await testDb.group.count({ where: { tournamentId: t.id } }),
      cups: await testDb.cup.count({ where: { tournamentId: t.id } }),
    };
    expect(before.teams).toBe(16);
    expect(before.groups).toBe(4);
    expect(before.cups).toBe(4);
    expect(before.matches).toBeGreaterThan(0);

    const auditBefore = await testDb.auditLog.count({ where: { tournamentId: t.id } });
    expect(auditBefore).toBeGreaterThan(0); // ya hay auditoría de resultados cargados

    const tournament = await testDb.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(tournament.status).toBe("FINISHED"); // se auto-finalizó al jugar la última final

    const summary = await resetTournament(t.id, { userId: null });
    expect(summary).toEqual(before);

    // Todo lo que pertenecía al torneo, borrado.
    expect(await testDb.team.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.player.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.registration.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.payment.count()).toBe(0); // cascada desde Registration
    expect(await testDb.group.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.groupTeam.count()).toBe(0);
    expect(await testDb.cup.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.bracket.count()).toBe(0);
    expect(await testDb.bracketMatch.count()).toBe(0);
    expect(await testDb.match.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.round.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.field.count({ where: { tournamentId: t.id } })).toBe(0);
    expect(await testDb.matchSlot.count()).toBe(0);
    expect(
      await testDb.notification.count({ where: { recipientTeamId: { in: teams.map((x) => x.id) } } }),
    ).toBe(0);

    // El torneo y su config quedan, listos para reusar.
    const after = await testDb.tournament.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.id).toBe(t.id);
    expect(after.slug).toBe(tournament.slug);
    expect(after.name).toBe(tournament.name);
    expect(after.status).toBe("SETUP");
    const config = await testDb.tournamentConfig.findUniqueOrThrow({ where: { tournamentId: t.id } });
    expect(config.groupCount).toBe(4); // la config de estructura no se toca

    // La auditoría de la edición anterior NO se borra, y queda una entrada nueva del reset.
    const auditAfter = await testDb.auditLog.findMany({ where: { tournamentId: t.id } });
    expect(auditAfter.length).toBeGreaterThan(auditBefore);
    expect(auditAfter.some((a) => a.action === "tournament.reset")).toBe(true);
  });

  it("después del reset se puede armar un torneo nuevo desde cero", async () => {
    const { t } = await playFullTournament();
    await resetTournament(t.id, { userId: null });

    const teams = await seedConfirmedTeams(t.id, 8, { prefix: "nueva-edicion" });
    await setTournamentStatus(t.id, "REGISTRATION_CLOSED");
    await saveGroupAssignment(t.id, [teams.slice(0, 4), teams.slice(4, 8)].map((g) => g.map((x) => x.id)));
    const { matches } = await generateGroupPhaseFixture(t.id);
    expect(matches).toBeGreaterThan(0);
  });
});
