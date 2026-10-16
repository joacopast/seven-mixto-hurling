import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament } from "../helpers/db";
import { createRegistration, RegistrationError } from "@/lib/services/registration";
import type { RegistrationSubmitInput } from "@/lib/validation/registration";

function buildInput(over: Partial<RegistrationSubmitInput> = {}): RegistrationSubmitInput {
  const players = Array.from({ length: 12 }, (_, i) => ({
    firstName: `Jugador${i + 1}`,
    lastName: "Test",
    docType: "DNI" as const,
    docNumber: `${40_000_000 + i}`,
    birthDate: "1996-05-20",
    gender: (i < 4 ? "M" : "F") as "M" | "F",
    isPlayer: true,
    shirtNumber: i + 1,
    phone: "",
    email: "",
    position: "",
    attendsParty: true,
    playsHockey: true,
  }));
  return {
    team: { name: "Argentina" },
    manager: {
      contactName: "Aoife Byrne",
      contactEmail: "treboles@test.local",
      contactPhone: "1155667788",
    },
    players,
    ...over,
  };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await testDb.$disconnect();
});

describe("createRegistration", () => {
  it("crea equipo, inscripción PENDING_PAYMENT, jugadores y audit log", async () => {
    await seedTournament();
    const res = await createRegistration(buildInput());

    const team = await testDb.team.findUnique({
      where: { id: res.teamId },
      include: { registration: true, players: true, manager: true },
    });

    expect(team).not.toBeNull();
    expect(team!.registrationStatus).toBe("PENDING_PAYMENT");
    expect(team!.players).toHaveLength(12);
    expect(team!.manager.role).toBe("TEAM_MANAGER");
    expect(team!.registration!.status).toBe("PENDING_PAYMENT");
    // 275.000 + 2 adicionales * 27.500 = 330.000 (sin recargo)
    expect(team!.registration!.totalAmount).toBe(330_000_00);
    expect(res.quote.tier).toBe("EARLY");

    const audit = await testDb.auditLog.findFirst({
      where: { entity: "Registration", entityId: res.registrationId },
    });
    expect(audit?.action).toBe("registration.create");

    const adminAlert = await testDb.notification.findFirst({
      where: { type: "ADMIN_ALERT", dedupeKey: { startsWith: `admin-alert:registration.create:${res.registrationId}` } },
    });
    expect(adminAlert).not.toBeNull();
    expect(adminAlert!.recipientEmail).toMatch(/@/);
  });

  it("guarda restricción alimenticia y asistencia a la fiesta por jugador", async () => {
    await seedTournament();
    const input = buildInput({
      players: [
        { ...buildInput().players[0]!, dietaryRestriction: "Celíaco", attendsParty: false },
        ...buildInput().players.slice(1),
      ],
    });
    const res = await createRegistration(input);
    const players = await testDb.player.findMany({ where: { teamId: res.teamId }, orderBy: { createdAt: "asc" } });
    expect(players[0]!.dietaryRestriction).toBe("Celíaco");
    expect(players[0]!.attendsParty).toBe(false);
    expect(players[1]!.dietaryRestriction).toBeNull();
    expect(players[1]!.attendsParty).toBe(true);
  });

  it("aplica el recargo del medio de pago configurado", async () => {
    await seedTournament({ paymentSurchargeBp: 600 });
    const res = await createRegistration(buildInput());
    // 330.000 + 6% = 349.800
    expect(res.quote.totalAmount).toBe(349_800_00);
    const reg = await testDb.registration.findUnique({ where: { id: res.registrationId } });
    expect(reg!.surchargeAmount).toBe(19_800_00);
  });

  it("rechaza si el plantel no llega al mínimo", async () => {
    await seedTournament();
    const input = buildInput({
      players: buildInput().players.slice(0, 5),
    });
    await expect(createRegistration(input)).rejects.toMatchObject({
      code: "ROSTER_INVALID",
    });
  });

  it("rechaza jugadores duplicados por documento", async () => {
    await seedTournament();
    const players = buildInput().players.map((p) => ({ ...p, docNumber: "12345678" }));
    await expect(createRegistration(buildInput({ players }))).rejects.toBeInstanceOf(
      RegistrationError,
    );
  });

  it("rechaza si las inscripciones no están abiertas", async () => {
    await seedTournament({ status: "SETUP" });
    await expect(createRegistration(buildInput())).rejects.toMatchObject({
      code: "TOURNAMENT_CLOSED",
    });
  });

  it("bloquea el equipo 65 cuando hay 64 cupos ocupados", async () => {
    const tournament = await seedTournament({ maxTeams: 2 });
    await createRegistration(buildInput({ team: { name: "Brasil" }, manager: { contactName: "A", contactEmail: "a@test.local", contactPhone: "1" } }));
    await createRegistration(buildInput({ team: { name: "Chile" }, manager: { contactName: "B", contactEmail: "b@test.local", contactPhone: "2" } }));

    await expect(
      createRegistration(
        buildInput({
          team: { name: "Uruguay" },
          manager: { contactName: "C", contactEmail: "c@test.local", contactPhone: "3" },
        }),
      ),
    ).rejects.toMatchObject({ code: "TOURNAMENT_FULL" });

    const count = await testDb.team.count({ where: { tournamentId: tournament.id } });
    expect(count).toBe(2);
  });

  it("rechaza inscribir el mismo país dos veces (torneo formato mundial)", async () => {
    await seedTournament();
    await createRegistration(buildInput({ manager: { contactName: "A", contactEmail: "a@test.local", contactPhone: "1" } }));

    await expect(
      createRegistration(buildInput({ manager: { contactName: "B", contactEmail: "b@test.local", contactPhone: "2" } })),
    ).rejects.toMatchObject({ code: "DUPLICATE_TEAM" });

    const count = await testDb.team.count();
    expect(count).toBe(1);
  });

  it("deriva el código ISO del país como shortName automático", async () => {
    await seedTournament();
    const res = await createRegistration(buildInput());
    const team = await testDb.team.findUniqueOrThrow({ where: { id: res.teamId } });
    expect(team.shortName).toBe("ARG");
  });

  it("reutiliza el usuario responsable si ya existe (mismo email, varios equipos)", async () => {
    await seedTournament();
    await createRegistration(buildInput({ team: { name: "Argentina" } }));
    await createRegistration(buildInput({ team: { name: "Brasil" } }));
    const users = await testDb.user.count({ where: { email: "treboles@test.local" } });
    expect(users).toBe(1);
    const teams = await testDb.team.count();
    expect(teams).toBe(2);
  });
});
