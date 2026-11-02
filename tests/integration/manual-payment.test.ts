import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { testDb, resetDb, seedTournament } from "../helpers/db";
import { createRegistration } from "@/lib/services/registration";
import { adminCreateTeam } from "@/lib/services/admin-teams";
import { confirmManualPayment, voidManualPayment, PaymentError } from "@/lib/services/payment";

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
      shirtNumber: i + 1,
      phone: "",
      email: "",
      position: "",
      attendsParty: true,
      playsHockey: true,
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

    const adminAlert = await testDb.notification.findFirst({
      where: { type: "ADMIN_ALERT", dedupeKey: { startsWith: "admin-alert:payment.manual.confirm:" } },
    });
    expect(adminAlert).not.toBeNull();
    expect(adminAlert!.recipientEmail).toMatch(/@/);
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

    const adminAlert = await testDb.notification.findFirst({
      where: { type: "ADMIN_ALERT", dedupeKey: { startsWith: "admin-alert:payment.manual.deposit:" } },
    });
    expect(adminAlert).not.toBeNull();
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

describe("voidManualPayment — corregir un pago mal cargado", () => {
  it("anula una seña mal tipeada: vuelve a PENDING_PAYMENT y permite recargar bien", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    const total = (await testDb.registration.findUniqueOrThrow({ where: { id: reg.registrationId } }))
      .totalAmount;

    const wrong = await confirmManualPayment(reg.registrationId, { amount: 50_000, note: "mal tipeado" });
    expect(wrong.outcome).toBe("DEPOSIT_RECORDED");
    const wrongPayment = await testDb.payment.findFirstOrThrow({
      where: { registrationId: reg.registrationId, status: "APPROVED" },
    });

    const voided = await voidManualPayment(wrongPayment.id);
    expect(voided.newStatus).toBe("PENDING_PAYMENT");
    expect(voided.amountPaid).toBe(0);

    const team = await testDb.team.findUniqueOrThrow({
      where: { id: reg.teamId },
      include: { registration: { include: { payments: true } } },
    });
    expect(team.registrationStatus).toBe("PENDING_PAYMENT");
    expect(team.paymentStatus).toBe("NONE");
    expect(team.registration!.status).toBe("PENDING_PAYMENT");
    const cancelled = team.registration!.payments.find((p) => p.id === wrongPayment.id)!;
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.amount).toBe(50_000); // el monto mal cargado queda en el historial, no se borra

    const audit = await testDb.auditLog.findFirst({ where: { action: "payment.manual.void" } });
    expect(audit).not.toBeNull();

    // Ahora se puede cargar de nuevo con el monto correcto.
    const correct = await confirmManualPayment(reg.registrationId, { amount: total });
    expect(correct.outcome).toBe("CONFIRMED");
    const finalTeam = await testDb.team.findUniqueOrThrow({ where: { id: reg.teamId } });
    expect(finalTeam.registrationStatus).toBe("CONFIRMED");
  });

  it("anula una confirmación completa mal tipeada: vuelve a PENDING_PAYMENT (no queda CONFIRMED)", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await confirmManualPayment(reg.registrationId);
    const payment = await testDb.payment.findFirstOrThrow({ where: { registrationId: reg.registrationId } });

    const voided = await voidManualPayment(payment.id);
    expect(voided.newStatus).toBe("PENDING_PAYMENT");

    const team = await testDb.team.findUniqueOrThrow({
      where: { id: reg.teamId },
      include: { registration: true },
    });
    expect(team.registrationStatus).toBe("PENDING_PAYMENT");
    expect(team.registration!.confirmedAt).toBeNull();
  });

  it("si queda un pago previo (seña anterior), vuelve a DEPOSIT_PAID en vez de PENDING_PAYMENT", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    const total = (await testDb.registration.findUniqueOrThrow({ where: { id: reg.registrationId } }))
      .totalAmount;

    await confirmManualPayment(reg.registrationId, { amount: Math.round(total / 3) });
    const wrongSecond = await confirmManualPayment(reg.registrationId, { amount: 1 });
    expect(wrongSecond.outcome).toBe("DEPOSIT_RECORDED");
    const lastPayment = await testDb.payment.findFirstOrThrow({
      where: { registrationId: reg.registrationId, status: "APPROVED" },
      orderBy: { approvedAt: "desc" },
    });

    const voided = await voidManualPayment(lastPayment.id);
    expect(voided.newStatus).toBe("DEPOSIT_PAID");
    expect(voided.amountPaid).toBe(Math.round(total / 3));

    const team = await testDb.team.findUniqueOrThrow({ where: { id: reg.teamId } });
    expect(team.registrationStatus).toBe("DEPOSIT_PAID");
    expect(team.paymentStatus).toBe("PENDING");
  });

  it("deja anular un pago viejo aunque haya otro pago encima, no solo el último", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    const total = (await testDb.registration.findUniqueOrThrow({ where: { id: reg.registrationId } }))
      .totalAmount;
    const firstAmount = Math.round(total / 3);
    const secondAmount = Math.round(total / 4);

    await confirmManualPayment(reg.registrationId, { amount: firstAmount });
    const firstPayment = await testDb.payment.findFirstOrThrow({ where: { registrationId: reg.registrationId } });
    await confirmManualPayment(reg.registrationId, { amount: secondAmount });

    const voided = await voidManualPayment(firstPayment.id);
    expect(voided.newStatus).toBe("DEPOSIT_PAID");
    expect(voided.amountPaid).toBe(secondAmount); // solo queda el segundo pago aprobado

    const team = await testDb.team.findUniqueOrThrow({
      where: { id: reg.teamId },
      include: { registration: { include: { payments: true } } },
    });
    expect(team.registrationStatus).toBe("DEPOSIT_PAID");
    const firstCancelled = team.registration!.payments.find((p) => p.id === firstPayment.id)!;
    expect(firstCancelled.status).toBe("CANCELLED");
  });

  it("no deja anular un pago de Mercado Pago", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    const payment = await testDb.payment.create({
      data: {
        registrationId: reg.registrationId,
        provider: "MERCADOPAGO",
        status: "APPROVED",
        amount: 1000,
        mpPaymentId: "mp-123",
      },
    });
    await expect(voidManualPayment(payment.id)).rejects.toMatchObject({ code: "NOT_VOIDABLE" });
  });
});
