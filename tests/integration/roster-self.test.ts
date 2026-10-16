import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament, seedConfirmedTeams } from "../helpers/db";
import { updateMyPlayer, RosterSelfError } from "@/lib/services/roster-self";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$disconnect();
});

function validInput(over: Partial<Parameters<typeof updateMyPlayer>[2]> = {}) {
  return {
    firstName: "Lucas",
    lastName: "Gómez",
    docType: "DNI" as const,
    docNumber: "40123456",
    birthDate: "1996-05-20",
    gender: "M" as const,
    shirtNumber: 7,
    phone: "",
    email: "",
    position: "",
    ...over,
  };
}

describe("updateMyPlayer — edición de plantel desde el portal del equipo", () => {
  it("el responsable corrige los datos de un jugador de su equipo", async () => {
    const t = await seedTournament();
    const teams = await seedConfirmedTeams(t.id, 1, { playersPerTeam: 1 });
    const team = await testDb.team.findUniqueOrThrow({
      where: { id: teams[0]!.id },
      include: { players: true },
    });
    const player = team.players[0]!;

    await updateMyPlayer(player.id, team.managerUserId, validInput({ firstName: "Lucas Corregido" }));

    const after = await testDb.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(after.firstName).toBe("Lucas Corregido");
    expect(after.docNumber).toBe("40123456");

    const audit = await testDb.auditLog.findFirst({ where: { action: "player.update" } });
    expect(audit).not.toBeNull();
  });

  it("rechaza si el jugador no es de un equipo del que llama", async () => {
    const t = await seedTournament();
    const teams = await seedConfirmedTeams(t.id, 2, { playersPerTeam: 1 });
    const teamA = await testDb.team.findUniqueOrThrow({
      where: { id: teams[0]!.id },
      include: { players: true },
    });
    const teamB = await testDb.team.findUniqueOrThrow({ where: { id: teams[1]!.id } });
    const playerOfA = teamA.players[0]!;

    await expect(
      updateMyPlayer(playerOfA.id, teamB.managerUserId, validInput()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rechaza un documento duplicado con otro jugador del mismo equipo", async () => {
    const t = await seedTournament();
    const teams = await seedConfirmedTeams(t.id, 1, { playersPerTeam: 2 });
    const team = await testDb.team.findUniqueOrThrow({
      where: { id: teams[0]!.id },
      include: { players: { orderBy: { createdAt: "asc" } } },
    });
    const [p0, p1] = team.players;
    // seedConfirmedTeams no pasa por normalizeDoc (inserta directo) — normalizamos
    // acá para que el duplicado matchee lo que updateMyPlayer va a comparar.
    await testDb.player.update({ where: { id: p0!.id }, data: { docNumber: "40000001" } });

    await expect(
      updateMyPlayer(p1!.id, team.managerUserId, validInput({ docNumber: "40000001" })),
    ).rejects.toMatchObject({ code: "DUP_DOC" });
  });

  it("rechaza editar si el plantel ya está bloqueado (rosterLockAt pasado)", async () => {
    const t = await seedTournament();
    await testDb.tournamentConfig.updateMany({
      where: { tournamentId: t.id },
      data: { rosterLockAt: new Date(Date.now() - 1000 * 60 * 60) }, // hace 1 hora
    });
    const teams = await seedConfirmedTeams(t.id, 1, { playersPerTeam: 1 });
    const team = await testDb.team.findUniqueOrThrow({
      where: { id: teams[0]!.id },
      include: { players: true },
    });

    await expect(
      updateMyPlayer(team.players[0]!.id, team.managerUserId, validInput()),
    ).rejects.toMatchObject({ code: "LOCKED" });
  });

  it("permite editar si rosterLockAt todavía no llegó", async () => {
    const t = await seedTournament();
    await testDb.tournamentConfig.updateMany({
      where: { tournamentId: t.id },
      data: { rosterLockAt: new Date(Date.now() + 1000 * 60 * 60) }, // en 1 hora
    });
    const teams = await seedConfirmedTeams(t.id, 1, { playersPerTeam: 1 });
    const team = await testDb.team.findUniqueOrThrow({
      where: { id: teams[0]!.id },
      include: { players: true },
    });

    await expect(
      updateMyPlayer(team.players[0]!.id, team.managerUserId, validInput()),
    ).resolves.toBeUndefined();
  });

  it("rechaza una fecha de nacimiento que no cumple la edad mínima", async () => {
    const t = await seedTournament();
    const teams = await seedConfirmedTeams(t.id, 1, { playersPerTeam: 1 });
    const team = await testDb.team.findUniqueOrThrow({
      where: { id: teams[0]!.id },
      include: { players: true },
    });
    const tooYoungBirthDate = new Date();
    tooYoungBirthDate.setFullYear(tooYoungBirthDate.getFullYear() - 10); // 10 años, mínimo es 16

    await expect(
      updateMyPlayer(
        team.players[0]!.id,
        team.managerUserId,
        validInput({ birthDate: tooYoungBirthDate.toISOString().slice(0, 10) }),
      ),
    ).rejects.toMatchObject({ code: "TOO_YOUNG" });
  });
});
