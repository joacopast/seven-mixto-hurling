import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament, seedConfirmedTeams } from "../helpers/db";
import {
  buildAutoAssignment,
  saveGroupAssignment,
  generateGroupPhaseFixture,
  setTournamentStatus,
  GroupsError,
} from "@/lib/services/groups";
import { setGroupMatchResult } from "@/lib/services/results";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$disconnect();
});

async function setup(teamCount = 8, groupCount = 2) {
  const t = await seedTournament();
  await testDb.tournamentConfig.updateMany({
    where: { tournamentId: t.id },
    data: { groupCount, groupSize: teamCount / groupCount, fieldCount: 4 },
  });
  const teams = await seedConfirmedTeams(t.id, teamCount);
  await setTournamentStatus(t.id, "REGISTRATION_CLOSED");
  return { t, teams };
}

describe("buildAutoAssignment", () => {
  it("reparte todos los equipos en la cantidad de grupos pedida", () => {
    const teams = Array.from({ length: 64 }, (_, i) => ({ id: `t${i}`, seed: null, playerCount: 10 }));
    const groups = buildAutoAssignment(teams, 16, "seed");
    expect(groups).toHaveLength(16);
    expect(groups.flat()).toHaveLength(64);
    expect(new Set(groups.flat()).size).toBe(64);
    expect(groups.every((g) => g.length === 4)).toBe(true);
  });

  it("con seeds manuales usa distribución serpiente por seed (gana sobre la cantidad de jugadores)", () => {
    // playerCount al revés del seed a propósito: si algo se coló por jugadores, este test lo detecta.
    const teams = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, seed: i + 1, playerCount: 8 - i }));
    const groups = buildAutoAssignment(teams, 4, "seed");
    // Serpiente por seed: g0=[t0,t7], g1=[t1,t6], g2=[t2,t5], g3=[t3,t4]
    expect(groups[0]).toEqual(["t0", "t7"]);
    expect(groups[3]).toEqual(["t3", "t4"]);
  });

  it("es determinista para la misma semilla", () => {
    const teams = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, seed: null, playerCount: 10 + (i % 5) }));
    const a = buildAutoAssignment(teams, 5, "abc").map((g) => g.join());
    const b = buildAutoAssignment(teams, 5, "abc").map((g) => g.join());
    expect(a).toEqual(b);
  });

  it("sin seed manual, siembra por cantidad de JUGADORES reales para equilibrar los grupos", () => {
    // 8 equipos, cantidades bien distintas: 20,18,16,14,12,10,8,6.
    const teams = [20, 18, 16, 14, 12, 10, 8, 6].map((playerCount, i) => ({
      id: `t${i}`,
      seed: null,
      playerCount,
    }));
    const groups = buildAutoAssignment(teams, 2, "balance-seed");
    expect(groups).toHaveLength(2);

    const byId = new Map(teams.map((t) => [t.id, t.playerCount]));
    const totals = groups.map((g) => g.reduce((sum, id) => sum + byId.get(id)!, 0));
    // La serpiente por jugadores deja los dos grupos con la misma cantidad total.
    expect(totals[0]).toBe(totals[1]);
    expect(totals[0]).toBe(52);
  });

  it("no junta a todos los equipos 'grandes' en el mismo grupo", () => {
    // 16 equipos: la mitad con plantel grande, la mitad chico, en orden aleatorio de entrada.
    const teams = Array.from({ length: 16 }, (_, i) => ({
      id: `t${i}`,
      seed: null,
      playerCount: i % 2 === 0 ? 20 : 8,
    }));
    const groups = buildAutoAssignment(teams, 4, "mix-seed");
    const byId = new Map(teams.map((t) => [t.id, t.playerCount]));
    for (const g of groups) {
      const big = g.filter((id) => byId.get(id) === 20).length;
      const small = g.filter((id) => byId.get(id) === 8).length;
      // Cada grupo de 4 queda con una mezcla (no 4 grandes ni 4 chicos juntos).
      expect(big).toBeGreaterThan(0);
      expect(small).toBeGreaterThan(0);
    }
  });
});

describe("saveGroupAssignment + generateGroupPhaseFixture", () => {
  it("crea grupos, GroupTeam y un fixture round-robin con horarios y canchas", async () => {
    const { t, teams } = await setup(8, 2);
    const assignment = [teams.slice(0, 4).map((x) => x.id), teams.slice(4).map((x) => x.id)];
    await saveGroupAssignment(t.id, assignment);

    const groups = await testDb.group.findMany({
      where: { tournamentId: t.id },
      include: { groupTeams: true },
    });
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.groupTeams.length === 4)).toBe(true);

    const res = await generateGroupPhaseFixture(t.id);
    expect(res.matches).toBe(12); // 2 grupos × 6
    expect(res.tandas).toBe(3); // 12 / 4 canchas

    const matches = await testDb.match.findMany({
      where: { tournamentId: t.id, phase: "GROUP" },
      include: { slot: { include: { round: true, field: true } } },
    });
    expect(matches).toHaveLength(12);
    expect(matches.every((m) => m.slot?.field && m.slot?.round)).toBe(true);

    // Cada equipo juega 3 partidos.
    const perTeam = new Map<string, number>();
    for (const m of matches) {
      perTeam.set(m.homeTeamId!, (perTeam.get(m.homeTeamId!) ?? 0) + 1);
      perTeam.set(m.awayTeamId!, (perTeam.get(m.awayTeamId!) ?? 0) + 1);
    }
    expect([...perTeam.values()].every((n) => n === 3)).toBe(true);
  });

  it("rechaza rearmar grupos si ya hay un resultado cargado", async () => {
    const { t, teams } = await setup(8, 2);
    await saveGroupAssignment(t.id, [teams.slice(0, 4).map((x) => x.id), teams.slice(4).map((x) => x.id)]);
    await generateGroupPhaseFixture(t.id);
    await setTournamentStatus(t.id, "GROUPS_PUBLISHED");

    const anyMatch = await testDb.match.findFirst({ where: { tournamentId: t.id, phase: "GROUP" } });
    await setGroupMatchResult(anyMatch!.id, { homeScore: 1, awayScore: 0 });

    await expect(
      saveGroupAssignment(t.id, [teams.slice(0, 4).map((x) => x.id), teams.slice(4).map((x) => x.id)]),
    ).rejects.toBeInstanceOf(GroupsError);
  });

  it("rechaza equipos no confirmados en la asignación", async () => {
    const { t, teams } = await setup(8, 2);
    const ghost = await seedConfirmedTeams(t.id, 1, { prefix: "ghost" });
    await testDb.team.update({ where: { id: ghost[0]!.id }, data: { registrationStatus: "PENDING_PAYMENT" } });
    await expect(
      saveGroupAssignment(t.id, [
        [...teams.slice(0, 3).map((x) => x.id), ghost[0]!.id],
        teams.slice(4).map((x) => x.id),
      ]),
    ).rejects.toBeInstanceOf(GroupsError);
  });
});

describe("setGroupMatchResult → recálculo de posiciones", () => {
  async function withFixture() {
    const { t, teams } = await setup(4, 1);
    await saveGroupAssignment(t.id, [teams.map((x) => x.id)]);
    await generateGroupPhaseFixture(t.id);
    await setTournamentStatus(t.id, "GROUPS_PUBLISHED");
    const matches = await testDb.match.findMany({
      where: { tournamentId: t.id, phase: "GROUP" },
      orderBy: { createdAt: "asc" },
    });
    const group = await testDb.group.findFirst({ where: { tournamentId: t.id } });
    return { t, teams, matches, groupId: group!.id };
  }

  it("actualiza la tabla y marca el torneo en juego con el primer resultado", async () => {
    const { t, matches, groupId } = await withFixture();
    await setGroupMatchResult(matches[0]!.id, { homeScore: 3, awayScore: 1 });

    const tournament = await testDb.tournament.findUnique({ where: { id: t.id } });
    expect(tournament!.status).toBe("GROUPS_IN_PROGRESS");

    const gts = await testDb.groupTeam.findMany({ where: { groupId } });
    const winner = gts.find((g) => g.teamId === matches[0]!.homeTeamId)!;
    expect(winner).toMatchObject({ played: 1, won: 1, points: 3, goalsFor: 3, goalDiff: 2, rank: 1 });
  });

  it("corregir un resultado recalcula el ranking del grupo", async () => {
    const { matches, groupId } = await withFixture();
    // Todos los partidos: home gana 1-0.
    for (const m of matches) await setGroupMatchResult(m.id, { homeScore: 1, awayScore: 0 });

    const before = await testDb.groupTeam.findMany({ where: { groupId }, orderBy: { rank: "asc" } });
    const topTeam = before[0]!.teamId;

    // Corregimos: el partido donde topTeam era local ahora lo pierde 0-5.
    const topMatch = matches.find((m) => m.homeTeamId === topTeam)!;
    await setGroupMatchResult(topMatch.id, { homeScore: 0, awayScore: 5 });

    const after = await testDb.groupTeam.findMany({ where: { groupId }, orderBy: { rank: "asc" } });
    expect(after[0]!.teamId).not.toBe(topTeam);
    const topRow = after.find((g) => g.teamId === topTeam)!;
    expect(topRow.rank).toBeGreaterThan(1);
  });

  it("walkover: el que se presenta gana 3-0 y suma 3 puntos", async () => {
    const { matches, groupId } = await withFixture();
    const m = matches[0]!;
    await setGroupMatchResult(m.id, { walkover: m.homeTeamId! });

    const updated = await testDb.match.findUnique({ where: { id: m.id } });
    expect(updated!.status).toBe("WALKOVER");
    expect(updated!.winnerTeamId).toBe(m.homeTeamId);

    const row = await testDb.groupTeam.findFirst({ where: { groupId, teamId: m.homeTeamId! } });
    expect(row).toMatchObject({ points: 3, goalsFor: 3, won: 1 });
  });
});
