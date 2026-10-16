import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament, seedConfirmedTeams } from "../helpers/db";
import { saveGroupAssignment, generateGroupPhaseFixture, setTournamentStatus } from "@/lib/services/groups";
import { rescheduleRound, ScheduleError } from "@/lib/services/schedule";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$disconnect();
});

async function setupFixture() {
  const t = await seedTournament();
  await testDb.tournamentConfig.updateMany({
    where: { tournamentId: t.id },
    data: { groupCount: 2, groupSize: 4, fieldCount: 2 },
  });
  const teams = await seedConfirmedTeams(t.id, 8);
  await setTournamentStatus(t.id, "REGISTRATION_CLOSED");
  const assignment = [teams.slice(0, 4).map((x) => x.id), teams.slice(4).map((x) => x.id)];
  await saveGroupAssignment(t.id, assignment);
  await generateGroupPhaseFixture(t.id);
  return { t, teams };
}

describe("rescheduleRound", () => {
  it("corre en cascada el mismo delta sobre las tandas siguientes, sin tocar las anteriores", async () => {
    const { t } = await setupFixture();
    const rounds = await testDb.round.findMany({
      where: { tournamentId: t.id, phase: "GROUP" },
      orderBy: { startsAt: "asc" },
    });
    expect(rounds.length).toBeGreaterThanOrEqual(3);

    const target = rounds[1]!;
    const before = rounds.map((r) => r.startsAt.getTime());
    const newStart = new Date(target.startsAt.getTime() + 30 * 60_000);

    const res = await rescheduleRound(target.id, newStart);
    expect(res.deltaMinutes).toBe(30);
    expect(res.shiftedRounds).toBe(rounds.length - 2); // todas menos la editada y las anteriores

    const after = await testDb.round.findMany({
      where: { tournamentId: t.id, phase: "GROUP" },
      orderBy: { order: "asc" },
    });
    for (let i = 0; i < after.length; i++) {
      if (i < 1) {
        // Rondas anteriores a la editada: sin cambios.
        expect(after[i]!.startsAt.getTime()).toBe(before[i]);
      } else {
        // La editada y todas las siguientes: +30 min.
        expect(after[i]!.startsAt.getTime()).toBe(before[i]! + 30 * 60_000);
      }
    }

    const audit = await testDb.auditLog.findFirst({ where: { action: "round.reschedule" } });
    expect(audit).not.toBeNull();

    const notifs = await testDb.notification.findMany({ where: { type: "TIME_CHANGED" } });
    expect(notifs.length).toBeGreaterThan(0);
  });

  it("es un no-op si el horario no cambia", async () => {
    const { t } = await setupFixture();
    const round = await testDb.round.findFirstOrThrow({ where: { tournamentId: t.id, phase: "GROUP" } });
    const res = await rescheduleRound(round.id, round.startsAt);
    expect(res.shiftedRounds).toBe(0);
    expect(res.notifiedTeams).toBe(0);
  });

  it("rechaza una tanda inexistente", async () => {
    await expect(rescheduleRound("no-existe", new Date())).rejects.toBeInstanceOf(ScheduleError);
  });
});
