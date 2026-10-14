import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { testDb, resetDb, seedTournament } from "../helpers/db";
import type { MpPayment, MpPaymentStatus } from "@/lib/payments/mercadopago";

/* ---------------- Mock del cliente de Mercado Pago ---------------- */

const mpState: {
  payments: Map<string, MpPayment>;
  preferenceCounter: number;
  signatureValid: boolean;
} = { payments: new Map(), preferenceCounter: 0, signatureValid: true };

vi.mock("@/lib/payments/mercadopago", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payments/mercadopago")>();
  return {
    ...actual,
    mercadoPagoConfigured: () => true,
    createPreference: vi.fn(async (input: { externalReference: string; amount: number }) => {
      mpState.preferenceCounter++;
      return {
        id: `pref-${mpState.preferenceCounter}`,
        init_point: `https://mp.test/checkout/pref-${mpState.preferenceCounter}`,
      };
    }),
    getPayment: vi.fn(async (id: string | number) => {
      const p = mpState.payments.get(String(id));
      if (!p) throw new Error(`pago ${id} no existe en el mock`);
      return p;
    }),
    searchPaymentsByReference: vi.fn(async (ref: string) =>
      [...mpState.payments.values()].filter((p) => p.external_reference === ref),
    ),
    verifyWebhookSignature: vi.fn(() => ({ valid: mpState.signatureValid })),
  };
});

const { createCheckoutForRegistration, processPaymentWebhook, reconcilePendingPayments } =
  await import("@/lib/services/payment");
const { createRegistration } = await import("@/lib/services/registration");

/* ---------------- Helpers ---------------- */

function mpPayment(over: Partial<MpPayment> & { external_reference: string }): MpPayment {
  const id = over.id ?? Math.floor(Math.random() * 1e9);
  const p: MpPayment = {
    id,
    status: (over.status ?? "approved") as MpPaymentStatus,
    status_detail: over.status_detail ?? "accredited",
    transaction_amount: over.transaction_amount ?? 330000,
    currency_id: over.currency_id ?? "ARS",
    external_reference: over.external_reference,
    payer: over.payer ?? { email: "pagador@test.local" },
    date_approved: over.date_approved ?? new Date().toISOString(),
  };
  mpState.payments.set(String(id), p);
  return p;
}

function buildRegInput(over: { name?: string; email?: string; players?: number } = {}) {
  const n = over.players ?? 12;
  return {
    team: { name: over.name ?? "Argentina" },
    manager: {
      contactName: "Aoife Byrne",
      contactEmail: over.email ?? "treboles@test.local",
      contactPhone: "1155667788",
    },
    players: Array.from({ length: n }, (_, i) => ({
      firstName: `Jugador${i + 1}`,
      lastName: "Test",
      docType: "DNI" as const,
      docNumber: `${50_000_000 + i}${over.name ?? ""}`.slice(0, 18),
      birthDate: "1996-05-20",
      gender: (i < 4 ? "M" : "F") as "M" | "F",
      isPlayer: true,
      shirtNumber: i + 1,
      phone: "",
      email: "",
      position: "",
    })),
  };
}

async function webhook(dataId: string | number) {
  return processPaymentWebhook({
    dataId: String(dataId),
    topic: "payment",
    xSignature: "ts=1,v1=x",
    xRequestId: "req-1",
    rawBody: { type: "payment", data: { id: String(dataId) } },
  });
}

beforeEach(async () => {
  await resetDb();
  mpState.payments.clear();
  mpState.preferenceCounter = 0;
  mpState.signatureValid = true;
});

afterAll(async () => {
  await testDb.$disconnect();
});

/* ---------------- Tests ---------------- */

describe("createCheckoutForRegistration", () => {
  it("crea el Payment, pasa la inscripción a PAYMENT_STARTED y audita", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());

    const checkout = await createCheckoutForRegistration(reg.registrationId);
    expect(checkout.checkoutUrl).toContain("mp.test/checkout");

    const updated = await testDb.registration.findUnique({
      where: { id: reg.registrationId },
      include: { payments: true },
    });
    expect(updated!.status).toBe("PAYMENT_STARTED");
    expect(updated!.payments).toHaveLength(1);
    expect(updated!.payments[0]!.status).toBe("PENDING");
    expect(updated!.payments[0]!.amount).toBe(330_000_00);

    const audit = await testDb.auditLog.findFirst({
      where: { action: "payment.checkout.start" },
    });
    expect(audit).not.toBeNull();
  });

  it("rechaza iniciar checkout si ya está confirmada", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpPayment({ external_reference: reg.registrationId, id: 1, transaction_amount: 330000 });
    await webhook(1);

    await expect(createCheckoutForRegistration(reg.registrationId)).rejects.toMatchObject({
      code: "ALREADY_PAID",
    });
  });
});

describe("webhook — pago aprobado", () => {
  it("confirma la inscripción y el equipo, y encola notificaciones", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpPayment({ external_reference: reg.registrationId, id: 100, transaction_amount: 330000 });

    const res = await webhook(100);
    expect(res.httpStatus).toBe(200);

    const team = await testDb.team.findFirst({
      where: { id: reg.teamId },
      include: { registration: true },
    });
    expect(team!.registrationStatus).toBe("CONFIRMED");
    expect(team!.paymentStatus).toBe("APPROVED");
    expect(team!.registration!.status).toBe("CONFIRMED");
    expect(team!.registration!.confirmedAt).not.toBeNull();

    const payment = await testDb.payment.findFirst({ where: { mpPaymentId: "100" } });
    expect(payment!.status).toBe("APPROVED");

    const notifs = await testDb.notification.findMany({
      where: { recipientTeamId: reg.teamId },
    });
    expect(notifs.map((n) => n.type).sort()).toEqual([
      "PAYMENT_APPROVED",
      "REGISTRATION_CONFIRMED",
      "TEAM_APPROVED",
    ]);

    const event = await testDb.webhookEvent.findFirst({ where: { resourceId: "100" } });
    expect(event!.status).toBe("PROCESSED");
  });
});

describe("webhook — idempotencia", () => {
  it("el mismo webhook dos veces no duplica confirmación ni notificaciones", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpPayment({ external_reference: reg.registrationId, id: 200, transaction_amount: 330000 });

    const first = await webhook(200);
    const second = await webhook(200);

    expect(first.body.outcome).toBe("CONFIRMED");
    expect(second.body).toMatchObject({ idempotent: true });

    const payments = await testDb.payment.findMany({ where: { registrationId: reg.registrationId } });
    expect(payments).toHaveLength(1);

    const notifs = await testDb.notification.count({ where: { recipientTeamId: reg.teamId } });
    expect(notifs).toBe(3); // registration.create + payment aprobado + equipo confirmado

    const confirmedTeams = await testDb.team.count({ where: { registrationStatus: "CONFIRMED" } });
    expect(confirmedTeams).toBe(1);
  });

  it("reprocesa un evento que había quedado en ERROR", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);

    // Primer intento: el pago aún no existe en MP → ERROR (500).
    const failed = await webhook(300);
    expect(failed.httpStatus).toBe(500);
    let event = await testDb.webhookEvent.findFirst({ where: { resourceId: "300" } });
    expect(event!.status).toBe("ERROR");

    // Ahora el pago existe y llega otra vez el webhook.
    mpPayment({ external_reference: reg.registrationId, id: 300, transaction_amount: 330000 });
    const ok = await webhook(300);
    expect(ok.httpStatus).toBe(200);
    event = await testDb.webhookEvent.findFirst({ where: { resourceId: "300" } });
    expect(event!.status).toBe("PROCESSED");
  });
});

describe("webhook — rechazado / monto / reembolso", () => {
  it("pago rechazado deja la inscripción reintentar", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpPayment({ external_reference: reg.registrationId, id: 400, status: "rejected", date_approved: null });

    await webhook(400);
    const updated = await testDb.registration.findUnique({ where: { id: reg.registrationId } });
    expect(updated!.status).toBe("PAYMENT_REJECTED");
    const team = await testDb.team.findUnique({ where: { id: reg.teamId } });
    expect(team!.paymentStatus).toBe("REJECTED");
  });

  it("pago aprobado con monto distinto al cotizado → OBSERVED", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpPayment({ external_reference: reg.registrationId, id: 500, transaction_amount: 1000 });

    const res = await webhook(500);
    expect(res.body.outcome).toBe("OBSERVED_AMOUNT");
    const updated = await testDb.registration.findUnique({ where: { id: reg.registrationId } });
    expect(updated!.status).toBe("OBSERVED");
  });

  it("reembolso posterior a la confirmación → OBSERVED", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpPayment({ external_reference: reg.registrationId, id: 600, transaction_amount: 330000 });
    await webhook(600);

    mpState.payments.get("600")!.status = "refunded";
    // nuevo evento (otro resourceId) para el mismo pago
    await processPaymentWebhook({
      dataId: "600",
      topic: "payment",
      xSignature: "s",
      xRequestId: "r2",
      rawBody: {},
    });
    // el segundo evento con el mismo resourceId sería idempotente; forzamos reproceso
    await testDb.webhookEvent.updateMany({ where: { resourceId: "600" }, data: { status: "RECEIVED" } });
    await webhook(600);

    const updated = await testDb.registration.findUnique({ where: { id: reg.registrationId } });
    expect(updated!.status).toBe("OBSERVED");
    const team = await testDb.team.findUnique({ where: { id: reg.teamId } });
    expect(team!.paymentStatus).toBe("REFUNDED");
  });
});

describe("webhook — sobrecupo", () => {
  it("no confirma el equipo si ya hay maxTeams confirmados; lo manda a lista de espera", async () => {
    await seedTournament({ maxTeams: 1 });

    const a = await createRegistration(buildRegInput({ name: "Brasil", email: "a@test.local" }));
    await createCheckoutForRegistration(a.registrationId);
    mpPayment({ external_reference: a.registrationId, id: 700, transaction_amount: 330000 });
    await webhook(700);

    // El torneo ahora tiene 1 confirmado (= maxTeams). Segundo equipo estaba PENDING
    // desde antes de llenarse (creado ok porque maxTeams cuenta occupying, subamos a 2).
    await testDb.tournamentConfig.updateMany({ data: { maxTeams: 2 } });
    const b = await createRegistration(buildRegInput({ name: "Chile", email: "b@test.local" }));
    await createCheckoutForRegistration(b.registrationId);
    // volvemos a 1 el tope: al confirmar B habría 2 confirmados > 1
    await testDb.tournamentConfig.updateMany({ data: { maxTeams: 1 } });
    mpPayment({ external_reference: b.registrationId, id: 701, transaction_amount: 330000 });
    const res = await webhook(701);

    expect(res.body.outcome).toBe("WAITLISTED_OVERBOOK");
    const teamB = await testDb.team.findUnique({ where: { id: b.teamId } });
    expect(teamB!.registrationStatus).toBe("WAITLISTED");
    expect(teamB!.paymentStatus).toBe("APPROVED");
  });
});

describe("webhook — firma inválida", () => {
  it("rechaza con 401 y no crea evento procesado", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpState.signatureValid = false;
    mpPayment({ external_reference: reg.registrationId, id: 800, transaction_amount: 330000 });

    const res = await webhook(800);
    expect(res.httpStatus).toBe(401);
    const updated = await testDb.registration.findUnique({ where: { id: reg.registrationId } });
    expect(updated!.status).toBe("PAYMENT_STARTED");
  });
});

describe("reconcilePendingPayments", () => {
  it("detecta un pago aprobado cuando se perdió el webhook", async () => {
    await seedTournament();
    const reg = await createRegistration(buildRegInput());
    await createCheckoutForRegistration(reg.registrationId);
    mpPayment({ external_reference: reg.registrationId, id: 900, transaction_amount: 330000 });

    // Simular que quedó "trabado" hace 20 minutos.
    await testDb.$executeRaw`
      UPDATE "Registration" SET "updatedAt" = ${new Date(Date.now() - 20 * 60_000)}
      WHERE id = ${reg.registrationId}`;

    const result = await reconcilePendingPayments({ olderThanMinutes: 15 });
    expect(result.updated).toBe(1);

    const updated = await testDb.registration.findUnique({ where: { id: reg.registrationId } });
    expect(updated!.status).toBe("CONFIRMED");
  });
});
