import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament } from "../helpers/db";
import { createRegistration } from "@/lib/services/registration";
import { adminCreateTeam } from "@/lib/services/admin-teams";
import { confirmManualPayment, PaymentError } from "@/lib/services/payment";

function buildRegInput(over: { name?: string; email?: string } = {}) {
  return {
    team: { name: over.name ?? "Argentina" },
    manager: {
      contactName: "Aoife Byrne",
      contactEmail: over.email ?? "treboles@test.local",
      contactPhone: "1155667788",
    },
    players: Array.from({ length: 12 }, (_, i) => ({
      firstName: `Jugador${i + 1}`,
      lastName: "Test",
      docType: "DNI" as const,
      docNumber: `${60_000_000 + i}${over.name ?? ""}`.slice(0, 18),
      birthDate: "1996-05-20",
      gender: (i < 4 ? "M" : "F") as "M" | "F",
      isPlayer: true,
      shirtNumber: i + 1,
      phone: "",
      email: "",
      position: "",
      attendsParty: true,
    })),
  };
}

beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await testDb.$disconnect();
});

describe("confirmManualPayment — transferencia confirmada a mano", () => {
  it("confirma la inscripción, crea un Payment MANUAL_TRANSFER y encola notificaciones", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());

    const res = await confirmManualPayment(reg.registrationId, { note: "comprobante OK" });
    expect(res.outcome).toBe("CONFIRMED");

    const team = await testDb.team.findUniqueOrThrow({
      where: { id: reg.teamId },
      include: { registration: { include: { payments: true } } },
    });
    expect(team.registrationStatus).toBe("CONFIRMED");
    expect(team.paymentStatus).toBe("APPROVED");
    expect(team.registration!.status).toBe("CONFIRMED");
    expect(team.registration!.confirmedAt).not.toBeNull();

    const payment = team.registration!.payments[0]!;
    expect(payment.provider).toBe("MANUAL_TRANSFER");
    expect(payment.status).toBe("APPROVED");
    // El monto SIEMPRE sale de Registration.totalAmount, nunca de un número externo.
    expect(payment.amount).toBe(team.registration!.totalAmount);
    expect(payment.mpPreferenceId).toBeNull();
    expect((payment.rawPayload as { note: string }).note).toBe("comprobante OK");

    // "Recibimos tu inscripción" se encola al crear; "pago aprobado" y "equipo
    // confirmado" se encolan al confirmar la transferencia.
    const notifs = await testDb.notification.findMany({ where: { recipientTeamId: reg.teamId } });
    expect(notifs.map((n) => n.type).sort()).toEqual([
      "PAYMENT_APPROVED",
      "REGISTRATION_CONFIRMED",
      "TEAM_APPROVED",
    ]);

    const audit = await testDb.auditLog.findFirst({ where: { action: "payment.manual.confirm" } });
    expect(audit).not.toBeNull();
  });

  it("es idempotente: confirmar dos veces no duplica el pago", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await confirmManualPayment(reg.registrationId);
    const second = await confirmManualPayment(reg.registrationId);
    expect(second.outcome).toBe("NOOP");

    const payments = await testDb.payment.count({ where: { registrationId: reg.registrationId } });
    expect(payments).toBe(1);
  });

  it("manda a lista de espera si ya no hay cupo (sobrecupo) y marca que hay que reintegrar", async () => {
    // El sobrecupo se da en la práctica con equipos cargados a mano por el admin
    // (adminCreateTeam no valida capacidad, a diferencia de la inscripción pública),
    // o si se bajó `maxTeams` después de tener equipos pendientes.
    const t = await seedTournament({ maxTeams: 1 });
    const a = await adminCreateTeam({
      tournamentId: t.id,
      name: "Brasil",
      contactName: "A",
      contactEmail: "a@test.local",
      contactPhone: "1",
      registrationStatus: "PENDING_PAYMENT",
    });
    const b = await adminCreateTeam({
      tournamentId: t.id,
      name: "Chile",
      contactName: "B",
      contactEmail: "b@test.local",
      contactPhone: "2",
      registrationStatus: "PENDING_PAYMENT",
    });
    const regA = await testDb.registration.findUniqueOrThrow({ where: { teamId: a.id } });
    const regB = await testDb.registration.findUniqueOrThrow({ where: { teamId: b.id } });

    await confirmManualPayment(regA.id);
    const res = await confirmManualPayment(regB.id);
    expect(res.outcome).toBe("WAITLISTED_OVERBOOK");

    const teamB = await testDb.team.findUniqueOrThrow({ where: { id: b.id } });
    expect(teamB.registrationStatus).toBe("WAITLISTED");
    expect(teamB.paymentStatus).toBe("APPROVED");

    const confirmedCount = await testDb.team.count({
      where: { tournamentId: t.id, registrationStatus: "CONFIRMED" },
    });
    expect(confirmedCount).toBe(1);
  });

  it("rechaza confirmar una inscripción cancelada", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await testDb.registration.update({ where: { id: reg.registrationId }, data: { status: "CANCELLED" } });
    await expect(confirmManualPayment(reg.registrationId)).rejects.toBeInstanceOf(PaymentError);
  });
});

describe("confirmManualPayment — seña (pago parcial)", () => {
  it("un monto menor al total reserva el lugar (DEPOSIT_PAID) sin confirmar el equipo", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    const total = (await testDb.registration.findUniqueOrThrow({ where: { id: reg.registrationId } }))
      .totalAmount;
    const depositAmount = Math.round(total / 3);

    const res = await confirmManualPayment(reg.registrationId, { amount: depositAmount, note: "seña" });
    expect(res.outcome).toBe("DEPOSIT_RECORDED");
    expect(res.amountPaid).toBe(depositAmount);
    expect(res.amountOwed).toBe(total - depositAmount);

    const team = await testDb.team.findUniqueOrThrow({
      where: { id: reg.teamId },
      include: { registration: { include: { payments: true } } },
    });
    expect(team.registrationStatus).toBe("DEPOSIT_PAID");
    expect(team.paymentStatus).toBe("PENDING");
    expect(team.registration!.status).toBe("DEPOSIT_PAID");
    expect(team.registration!.payments).toHaveLength(1);
    expect(team.registration!.payments[0]!.amount).toBe(depositAmount);

    const audit = await testDb.auditLog.findFirst({ where: { action: "payment.manual.deposit" } });
    expect(audit).not.toBeNull();
  });

  it("completar el saldo tras una seña confirma la inscripción", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    const total = (await testDb.registration.findUniqueOrThrow({ where: { id: reg.registrationId } }))
      .totalAmount;
    const depositAmount = Math.round(total / 3);

    await confirmManualPayment(reg.registrationId, { amount: depositAmount });
    const res = await confirmManualPayment(reg.registrationId, { amount: total - depositAmount });
    expect(res.outcome).toBe("CONFIRMED");

    const team = await testDb.team.findUniqueOrThrow({
      where: { id: reg.teamId },
      include: { registration: { include: { payments: true } } },
    });
    expect(team.registrationStatus).toBe("CONFIRMED");
    expect(team.paymentStatus).toBe("APPROVED");
    expect(team.registration!.payments).toHaveLength(2);
    const paidTotal = team.registration!.payments.reduce((s, p) => s + p.amount, 0);
    expect(paidTotal).toBe(total);
  });

  it("rechaza un monto mayor a lo que falta pagar", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    const total = (await testDb.registration.findUniqueOrThrow({ where: { id: reg.registrationId } }))
      .totalAmount;
    await expect(
      confirmManualPayment(reg.registrationId, { amount: total + 1 }),
    ).rejects.toMatchObject({ code: "AMOUNT_TOO_HIGH" });
  });

  it("rechaza un monto en cero o negativo", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await expect(confirmManualPayment(reg.registrationId, { amount: 0 })).rejects.toMatchObject({
      code: "INVALID_AMOUNT",
    });
  });
});
