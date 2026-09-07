import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament, seedConfirmedTeams } from "../helpers/db";
import {
  adminCreateTeam,
  adminUpdateTeam,
  adminAddPlayer,
  adminRemovePlayer,
  adminDeleteTeam,
  AdminTeamError,
} from "@/lib/services/admin-teams";
import { updateTournamentConfig, ConfigError } from "@/lib/services/config";
import { promoteWaitlistEntry, autoPromoteWaitlist } from "@/lib/services/waitlist";
import { joinWaitlist } from "@/lib/services/waitlist";
import type { ConfigFormInput } from "@/lib/validation/config";

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$disconnect();
});

/* ---------------- Admin teams ---------------- */

describe("admin-teams", () => {
  it("crea un equipo confirmado con su usuario responsable", async () => {
    const t = await seedTournament();
    const team = await adminCreateTeam({
      tournamentId: t.id,
      name: "Invitados FC",
      contactName: "Org",
      contactEmail: "invitados@test.local",
      contactPhone: "1",
      registrationStatus: "CONFIRMED",
    });
    const fresh = await testDb.team.findUniqueOrThrow({
      where: { id: team.id },
      include: { registration: true, manager: true },
    });
    expect(fresh.registrationStatus).toBe("CONFIRMED");
    expect(fresh.paymentStatus).toBe("APPROVED");
    expect(fresh.registration!.status).toBe("CONFIRMED");
    expect(fresh.manager.role).toBe("TEAM_MANAGER");

    const audit = await testDb.auditLog.findFirst({ where: { action: "team.admin.create" } });
    expect(audit).not.toBeNull();
  });

  it("edita datos del equipo y audita el diff", async () => {
    const t = await seedTournament();
    const [team] = await seedConfirmedTeams(t.id, 1);
    await adminUpdateTeam(team!.id, { name: "Nombre Nuevo", seed: 5 });
    const fresh = await testDb.team.findUniqueOrThrow({ where: { id: team!.id } });
    expect(fresh.name).toBe("Nombre Nuevo");
    expect(fresh.seed).toBe(5);
    const audit = await testDb.auditLog.findFirstOrThrow({ where: { action: "team.admin.update" } });
    expect(audit.previousValue).toMatchObject({ name: "Equipo team01" });
  });

  it("agrega y quita jugadores; rechaza documento duplicado", async () => {
    const t = await seedTournament();
    const [team] = await seedConfirmedTeams(t.id, 1);
    await adminAddPlayer(team!.id, {
      firstName: "Ana", lastName: "G", docType: "DNI", docNumber: "30.111.222", birthDate: "1995-01-01", gender: "F",
    });
    await expect(
      adminAddPlayer(team!.id, {
        firstName: "Otra", lastName: "P", docType: "DNI", docNumber: "30111222", birthDate: "1995-01-01", gender: "F",
      }),
    ).rejects.toMatchObject({ code: "DUP_DOC" });

    const players = await testDb.player.findMany({ where: { teamId: team!.id } });
    expect(players).toHaveLength(1);
    await adminRemovePlayer(players[0]!.id);
    expect(await testDb.player.count({ where: { teamId: team!.id } })).toBe(0);
  });

  it("no permite eliminar un equipo con partidos; sí uno sin partidos", async () => {
    const t = await seedTournament();
    const [a, b] = await seedConfirmedTeams(t.id, 2);
    await testDb.match.create({
      data: { tournamentId: t.id, phase: "GROUP", homeTeamId: a!.id, awayTeamId: b!.id, status: "SCHEDULED" },
    });
    await expect(adminDeleteTeam(a!.id)).rejects.toMatchObject({ code: "HAS_MATCHES" });

    const [c] = await seedConfirmedTeams(t.id, 1, { prefix: "solo" });
    await adminDeleteTeam(c!.id);
    expect(await testDb.team.count({ where: { id: c!.id } })).toBe(0);
  });
});

/* ---------------- Config ---------------- */

function configInput(over: Partial<ConfigFormInput> = {}): ConfigFormInput {
  return {
    name: "Seven Mixto 2026",
    edition: "2026",
    venueName: "",
    startDate: null,
    endDate: null,
    maxTeams: 64,
    groupCount: 16,
    groupSize: 4,
    cupNames: "ORO, PLATA, BRONCE, MADERA",
    cupAssignmentStrategy: "GROUP_POSITION",
    thirdPlaceMatch: false,
    matchDurationMin: 15,
    fieldCount: 6,
    turnoverMin: 5,
    drawResolution: "SHOOTOUT",
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    pointsWalkover: 3,
    walkoverScore: "3-0",
    tiebreakers: ["POINTS", "GOAL_DIFF", "GOALS_FOR", "DRAW_LOTS"],
    minPlayers: 7,
    maxPlayers: 20,
    playersOnField: 7,
    maxMenOnField: 3,
    minPlayerAge: 16,
    basePlayers: 10,
    earlyPrice: 275_000_00,
    latePrice: 300_000_00,
    extraPlayerPrice: 27_500_00,
    priceChangeAt: new Date("2026-11-15T00:00:00-03:00"),
    paymentSurchargePct: 6,
    registrationOpensAt: null,
    registrationClosesAt: null,
    rosterLockAt: null,
    teamEditLockAt: null,
    waitlistPaymentWindowHours: 48,
    rulesMarkdown: "Reglas nuevas",
    inclusionsList: "Pancho\nFruta",
    faqJson: '[{"q":"a","a":"b"}]',
    instagramUrl: "https://instagram.com/sevenmixtohurling",
    ...over,
  };
}

describe("updateTournamentConfig", () => {
  it("guarda precios (pesos→centavos), recargo (%→bp), tiebreakers y contenido", async () => {
    const t = await seedTournament();
    await updateTournamentConfig(t.id, configInput({ earlyPrice: 280_000_00, paymentSurchargePct: 5.5 }));
    const c = await testDb.tournamentConfig.findUniqueOrThrow({ where: { tournamentId: t.id } });
    expect(c.earlyPrice).toBe(280_000_00);
    expect(c.paymentSurchargeBp).toBe(550);
    expect(c.tiebreakers).toEqual(["POINTS", "GOAL_DIFF", "GOALS_FOR", "DRAW_LOTS"]);
    expect(c.inclusionsList).toEqual(["Pancho", "Fruta"]);
    expect(c.rulesMarkdown).toBe("Reglas nuevas");
  });

  it("devuelve warnings cuando la estructura no cierra", async () => {
    const t = await seedTournament();
    const { warnings } = await updateTournamentConfig(t.id, configInput({ groupCount: 4, groupSize: 4, maxTeams: 64 }));
    expect(warnings.some((w) => w.includes("entran"))).toBe(true);
  });

  it("bloquea cambiar equipos/grupos si ya hay grupos creados", async () => {
    const t = await seedTournament();
    await testDb.group.create({ data: { tournamentId: t.id, name: "A", order: 1 } });
    await expect(
      updateTournamentConfig(t.id, configInput({ groupCount: 8 })),
    ).rejects.toMatchObject({ code: "LOCKED" });
  });
});

/* ---------------- Waitlist ---------------- */

describe("lista de espera", () => {
  async function fullTournamentWithWaitlist() {
    const t = await seedTournament({ maxTeams: 2 });
    await seedConfirmedTeams(t.id, 2);
    // 2 en lista de espera
    await joinWaitlist({ teamName: "Espera 1", contactName: "A", contactEmail: "e1@test.local", contactPhone: "1" });
    await joinWaitlist({ teamName: "Espera 2", contactName: "B", contactEmail: "e2@test.local", contactPhone: "2" });
    return t;
  }

  it("promoteWaitlistEntry rechaza si no hay cupos", async () => {
    const t = await fullTournamentWithWaitlist();
    const wl = await testDb.registration.findFirstOrThrow({ where: { tournamentId: t.id, status: "WAITLISTED" } });
    await expect(promoteWaitlistEntry(wl.id)).rejects.toThrow(/cupos/i);
  });

  it("autoPromoteWaitlist llena los cupos que se liberan", async () => {
    const t = await fullTournamentWithWaitlist();
    // Se cancela un equipo confirmado → 1 cupo libre.
    const confirmed = await testDb.team.findFirstOrThrow({ where: { tournamentId: t.id, registrationStatus: "CONFIRMED" } });
    await testDb.team.update({ where: { id: confirmed.id }, data: { registrationStatus: "CANCELLED" } });
    await testDb.registration.updateMany({ where: { teamId: confirmed.id }, data: { status: "CANCELLED" } });

    const res = await autoPromoteWaitlist(t.id);
    expect(res.promoted).toBe(1);

    const invited = await testDb.registration.findFirst({
      where: { tournamentId: t.id, status: "PENDING_PAYMENT", waitlistInvitedAt: { not: null } },
    });
    expect(invited).not.toBeNull();
    expect(invited!.waitlistExpiresAt).not.toBeNull();

    const notif = await testDb.notification.findFirst({ where: { type: "WAITLIST_INVITED" } });
    expect(notif).not.toBeNull();
  });

  it("expira invitaciones vencidas sin pago y promueve al siguiente", async () => {
    const t = await fullTournamentWithWaitlist();
    const confirmed = await testDb.team.findFirstOrThrow({ where: { tournamentId: t.id, registrationStatus: "CONFIRMED" } });
    await testDb.team.update({ where: { id: confirmed.id }, data: { registrationStatus: "CANCELLED" } });
    await testDb.registration.updateMany({ where: { teamId: confirmed.id }, data: { status: "CANCELLED" } });

    await autoPromoteWaitlist(t.id); // promueve al primero
    // Forzar vencimiento.
    await testDb.registration.updateMany({
      where: { tournamentId: t.id, waitlistInvitedAt: { not: null } },
      data: { waitlistExpiresAt: new Date(Date.now() - 3_600_000) },
    });

    const res = await autoPromoteWaitlist(t.id);
    expect(res.expired).toBe(1);
    expect(res.promoted).toBe(1);

    // El primero volvió a WAITLISTED, el segundo quedó invitado.
    const waiting = await testDb.registration.count({ where: { tournamentId: t.id, status: "WAITLISTED" } });
    expect(waiting).toBe(1);
  });
});
