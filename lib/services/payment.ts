import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { enqueueNotification } from "@/lib/services/notification";
import { calculatePrice } from "@/lib/tournament/pricing";
import { CONFIRMED_STATUSES } from "@/lib/tournament/queries";
import {
  createPreference,
  getPayment,
  searchPaymentsByReference,
  verifyWebhookSignature,
  webhookUrl,
  paymentReturnUrl,
  MercadoPagoError,
  type MpPayment,
} from "@/lib/payments/mercadopago";
import { mapMpStatus } from "@/lib/payments/status-map";
import type { Prisma } from "@prisma/client";

export class PaymentError extends Error {
  constructor(
    message: string,
    public code:
      | "REGISTRATION_NOT_FOUND"
      | "NOT_PAYABLE"
      | "ALREADY_PAID",
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

const RETRYABLE_STATUSES = ["PENDING_PAYMENT", "PAYMENT_STARTED", "PAYMENT_REJECTED"] as const;

/* ============================================================
 *  Iniciar checkout
 * ============================================================ */

export interface CheckoutResult {
  checkoutUrl: string;
  paymentId: string;
  amount: number;
}

export async function createCheckoutForRegistration(
  registrationId: string,
  ctx: { ip?: string | null } = {},
): Promise<CheckoutResult> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    include: {
      team: { include: { _count: { select: { players: true } } } },
      tournament: { include: { config: true } },
    },
  });
  if (!registration || !registration.team || !registration.tournament?.config) {
    throw new PaymentError("Inscripción no encontrada.", "REGISTRATION_NOT_FOUND");
  }

  if (CONFIRMED_STATUSES.includes(registration.status as (typeof CONFIRMED_STATUSES)[number])) {
    throw new PaymentError("Esta inscripción ya está paga.", "ALREADY_PAID");
  }
  if (!RETRYABLE_STATUSES.includes(registration.status as (typeof RETRYABLE_STATUSES)[number])) {
    throw new PaymentError("Esta inscripción no admite pago en este estado.", "NOT_PAYABLE");
  }

  const config = registration.tournament.config;
  const now = new Date();

  // Recalcular el precio SIEMPRE en el backend antes de crear la preferencia.
  const quote = calculatePrice(
    {
      basePlayers: config.basePlayers,
      earlyPrice: config.earlyPrice,
      latePrice: config.latePrice,
      extraPlayerPrice: config.extraPlayerPrice,
      priceChangeAt: config.priceChangeAt,
      paymentSurchargeBp: config.paymentSurchargeBp,
    },
    registration.team._count.players,
    now,
  );

  const pref = await createPreference({
    externalReference: registration.id,
    amount: quote.totalAmount / 100,
    currency: config.currency,
    description: `Inscripción ${registration.team.name} — ${registration.tournament.name}`,
    payerEmail: registration.team.contactEmail,
    returnUrl: paymentReturnUrl(registration.id),
    notificationUrl: webhookUrl(),
  });

  const result = await db.$transaction(async (tx) => {
    if (quote.totalAmount !== registration.totalAmount) {
      await tx.registration.update({
        where: { id: registration.id },
        data: {
          playerCountQuoted: registration.team._count.players,
          priceTier: quote.tier,
          baseAmount: quote.baseAmount,
          extraPlayersAmount: quote.extraPlayersAmount,
          surchargeAmount: quote.surchargeAmount,
          totalAmount: quote.totalAmount,
          quotedAt: now,
        },
      });
      await writeAudit(tx, {
        tournamentId: registration.tournamentId,
        action: "registration.requote",
        entity: "Registration",
        entityId: registration.id,
        previousValue: { totalAmount: registration.totalAmount },
        newValue: { totalAmount: quote.totalAmount },
        ip: ctx.ip ?? null,
      });
    }

    const payment = await tx.payment.create({
      data: {
        registrationId: registration.id,
        provider: "MERCADOPAGO",
        mpPreferenceId: pref.id,
        status: "PENDING",
        amount: quote.totalAmount,
        currency: config.currency,
        payerEmail: registration.team.contactEmail,
      },
    });

    await tx.registration.update({
      where: { id: registration.id },
      data: { status: "PAYMENT_STARTED" },
    });
    await tx.team.update({
      where: { id: registration.teamId },
      data: { paymentStatus: "PENDING" },
    });

    await writeAudit(tx, {
      tournamentId: registration.tournamentId,
      action: "payment.checkout.start",
      entity: "Payment",
      entityId: payment.id,
      newValue: { mpPreferenceId: pref.id, amount: quote.totalAmount },
      ip: ctx.ip ?? null,
    });

    return payment;
  });

  return {
    checkoutUrl: pref.init_point,
    paymentId: result.id,
    amount: quote.totalAmount,
  };
}

/* ============================================================
 *  Confirmar pago manual (transferencia + comprobante por WhatsApp)
 * ============================================================ */

export interface ManualConfirmResult {
  outcome: "CONFIRMED" | "WAITLISTED_OVERBOOK" | "NOOP";
}

/**
 * El admin confirma a mano que llegó la transferencia (verificó el comprobante
 * por WhatsApp). El monto SIEMPRE se toma de `Registration.totalAmount` — nunca
 * de un número que tipee el admin — y queda un `Payment` con provider
 * MANUAL_TRANSFER para que /admin/pagos y las estadísticas sigan siendo fuente
 * única de verdad de lo recaudado.
 */
export async function confirmManualPayment(
  registrationId: string,
  opts: { note?: string | null } = {},
  ctx: { userId?: string | null; ip?: string | null } = {},
): Promise<ManualConfirmResult> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    include: { team: true, tournament: { include: { config: true } } },
  });
  if (!registration || !registration.team || !registration.tournament?.config) {
    throw new PaymentError("Inscripción no encontrada.", "REGISTRATION_NOT_FOUND");
  }
  if (CONFIRMED_STATUSES.includes(registration.status as (typeof CONFIRMED_STATUSES)[number])) {
    return { outcome: "NOOP" };
  }
  if (registration.status === "CANCELLED") {
    throw new PaymentError("Esta inscripción está cancelada.", "NOT_PAYABLE");
  }

  return db.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        registrationId,
        provider: "MANUAL_TRANSFER",
        status: "APPROVED",
        amount: registration.totalAmount,
        currency: registration.tournament!.config!.currency,
        rawPayload: { note: opts.note ?? null },
        approvedAt: new Date(),
        confirmedById: ctx.userId ?? null,
      },
    });

    const auditBase = { tournamentId: registration.tournamentId, entity: "Payment" as const, entityId: payment.id };

    // Guarda de cupo: igual que en MP, no confirmar por encima del máximo.
    const confirmedCount = await tx.team.count({
      where: {
        tournamentId: registration.tournamentId,
        registrationStatus: { in: [...CONFIRMED_STATUSES] },
        id: { not: registration.teamId },
      },
    });
    if (confirmedCount >= registration.tournament!.config!.maxTeams) {
      const lastPos = await tx.registration.aggregate({
        where: { tournamentId: registration.tournamentId, status: "WAITLISTED" },
        _max: { waitlistPosition: true },
      });
      const position = (lastPos._max.waitlistPosition ?? 0) + 1;
      await tx.registration.update({
        where: { id: registrationId },
        data: { status: "WAITLISTED", waitlistPosition: position },
      });
      await tx.team.update({
        where: { id: registration.teamId },
        data: { registrationStatus: "WAITLISTED", paymentStatus: "APPROVED" },
      });
      await writeAudit(tx, {
        ...auditBase,
        userId: ctx.userId,
        action: "payment.overbooked",
        newValue: { waitlistPosition: position, note: "requiere reintegrar la transferencia" },
        ip: ctx.ip ?? null,
      });
      await enqueueNotification(tx, {
        type: "WAITLIST_INVITED",
        recipientTeamId: registration.teamId,
        payload: { kind: "overbooked_refund", teamId: registration.teamId, position },
        dedupeKey: `payment-overbook:${payment.id}`,
      });
      return { outcome: "WAITLISTED_OVERBOOK" };
    }

    const now = new Date();
    await tx.registration.update({
      where: { id: registrationId },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    await tx.team.update({
      where: { id: registration.teamId },
      data: {
        registrationStatus: "CONFIRMED",
        paymentStatus: "APPROVED",
        registeredAt: registration.team!.registeredAt ?? now,
      },
    });
    await writeAudit(tx, {
      ...auditBase,
      userId: ctx.userId,
      action: "payment.manual.confirm",
      previousValue: { status: registration.status },
      newValue: { status: "CONFIRMED", amount: registration.totalAmount, note: opts.note ?? null },
      ip: ctx.ip ?? null,
    });
    await enqueueNotification(tx, {
      type: "PAYMENT_APPROVED",
      recipientTeamId: registration.teamId,
      recipientUserId: registration.team!.managerUserId,
      payload: { teamId: registration.teamId, teamName: registration.team!.name, amount: registration.totalAmount },
      dedupeKey: `payment-approved:${payment.id}`,
    });
    await enqueueNotification(tx, {
      type: "TEAM_APPROVED",
      recipientTeamId: registration.teamId,
      recipientUserId: registration.team!.managerUserId,
      payload: { teamId: registration.teamId, teamName: registration.team!.name },
      dedupeKey: `team-approved:${registration.teamId}`,
    });
    return { outcome: "CONFIRMED" };
  });
}

/* ============================================================
 *  Aplicar el estado de un pago de MP (core, sin webhook)
 * ============================================================ */

export interface ApplyResult {
  registrationId: string;
  outcome:
    | "CONFIRMED"
    | "OBSERVED_AMOUNT"
    | "WAITLISTED_OVERBOOK"
    | "REJECTED"
    | "REFUNDED"
    | "PENDING"
    | "NOOP";
}

/**
 * Toma un objeto de pago ya obtenido de la API de MP y actualiza Payment +
 * Registration + Team de forma consistente e idempotente, dentro de una
 * transacción que también escribe AuditLog y encola Notification.
 */
export async function applyMpPayment(payment: MpPayment): Promise<ApplyResult> {
  const registrationId = payment.external_reference;
  if (!registrationId) return { registrationId: "", outcome: "NOOP" };

  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    include: {
      team: true,
      tournament: { include: { config: true } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!registration || !registration.team || !registration.tournament?.config) {
    return { registrationId, outcome: "NOOP" };
  }

  const mappedStatus = mapMpStatus(payment.status);
  const mpPaymentId = String(payment.id);
  const paidCents = Math.round(payment.transaction_amount * 100);
  const alreadyConfirmed = CONFIRMED_STATUSES.includes(
    registration.status as (typeof CONFIRMED_STATUSES)[number],
  );

  return db.$transaction(async (tx) => {
    // Localizar / crear la fila Payment
    let paymentRow =
      registration.payments.find((p) => p.mpPaymentId === mpPaymentId) ??
      registration.payments.find((p) => !p.mpPaymentId && p.status === "PENDING") ??
      null;

    if (paymentRow) {
      paymentRow = await tx.payment.update({
        where: { id: paymentRow.id },
        data: {
          mpPaymentId,
          status: mappedStatus,
          payerEmail: payment.payer?.email ?? paymentRow.payerEmail,
          rawPayload: payment as unknown as Prisma.InputJsonValue,
          approvedAt: payment.date_approved ? new Date(payment.date_approved) : paymentRow.approvedAt,
        },
      });
    } else {
      paymentRow = await tx.payment.create({
        data: {
          registrationId,
          provider: "MERCADOPAGO",
          mpPreferenceId: `mp-${mpPaymentId}`,
          mpPaymentId,
          status: mappedStatus,
          amount: paidCents,
          currency: payment.currency_id,
          payerEmail: payment.payer?.email ?? null,
          rawPayload: payment as unknown as Prisma.InputJsonValue,
          approvedAt: payment.date_approved ? new Date(payment.date_approved) : null,
        },
      });
    }

    const auditBase = {
      tournamentId: registration.tournamentId,
      entity: "Payment" as const,
      entityId: paymentRow.id,
    };

    /* -------- APROBADO -------- */
    if (mappedStatus === "APPROVED") {
      if (alreadyConfirmed) {
        return { registrationId, outcome: "NOOP" as const };
      }

      // Verificación de monto contra el total congelado en la inscripción.
      if (paidCents !== registration.totalAmount) {
        await tx.registration.update({
          where: { id: registrationId },
          data: { status: "OBSERVED" },
        });
        await tx.team.update({
          where: { id: registration.teamId },
          data: { paymentStatus: "APPROVED", registrationStatus: "OBSERVED" },
        });
        await writeAudit(tx, {
          ...auditBase,
          action: "payment.amount.mismatch",
          previousValue: { expected: registration.totalAmount },
          newValue: { paid: paidCents, mpPaymentId },
        });
        await enqueueNotification(tx, {
          type: "RESULT_POSTED",
          recipientTeamId: registration.teamId,
          payload: { kind: "payment_observed", teamId: registration.teamId, paid: paidCents },
          dedupeKey: `payment-observed:${mpPaymentId}`,
        });
        return { registrationId, outcome: "OBSERVED_AMOUNT" as const };
      }

      // Guarda de cupo: no confirmar el equipo 65.
      const confirmedCount = await tx.team.count({
        where: {
          tournamentId: registration.tournamentId,
          registrationStatus: { in: [...CONFIRMED_STATUSES] },
          id: { not: registration.teamId },
        },
      });
      if (confirmedCount >= registration.tournament.config!.maxTeams) {
        const lastPos = await tx.registration.aggregate({
          where: { tournamentId: registration.tournamentId, status: "WAITLISTED" },
          _max: { waitlistPosition: true },
        });
        const position = (lastPos._max.waitlistPosition ?? 0) + 1;
        await tx.registration.update({
          where: { id: registrationId },
          data: { status: "WAITLISTED", waitlistPosition: position },
        });
        await tx.team.update({
          where: { id: registration.teamId },
          data: { registrationStatus: "WAITLISTED", paymentStatus: "APPROVED" },
        });
        await writeAudit(tx, {
          ...auditBase,
          action: "payment.overbooked",
          newValue: { mpPaymentId, waitlistPosition: position, note: "requiere reembolso total" },
        });
        await enqueueNotification(tx, {
          type: "WAITLIST_INVITED",
          recipientTeamId: registration.teamId,
          payload: { kind: "overbooked_refund", teamId: registration.teamId, position },
          dedupeKey: `payment-overbook:${mpPaymentId}`,
        });
        return { registrationId, outcome: "WAITLISTED_OVERBOOK" as const };
      }

      const now = new Date();
      await tx.registration.update({
        where: { id: registrationId },
        data: { status: "CONFIRMED", confirmedAt: now },
      });
      await tx.team.update({
        where: { id: registration.teamId },
        data: {
          registrationStatus: "CONFIRMED",
          paymentStatus: "APPROVED",
          registeredAt: registration.team.registeredAt ?? now,
        },
      });
      await writeAudit(tx, {
        ...auditBase,
        action: "payment.approved",
        previousValue: { status: registration.status },
        newValue: { status: "CONFIRMED", mpPaymentId, amount: paidCents },
      });
      await enqueueNotification(tx, {
        type: "PAYMENT_APPROVED",
        recipientTeamId: registration.teamId,
        recipientUserId: registration.team.managerUserId,
        payload: { teamId: registration.teamId, teamName: registration.team.name, amount: paidCents },
        dedupeKey: `payment-approved:${mpPaymentId}`,
      });
      await enqueueNotification(tx, {
        type: "TEAM_APPROVED",
        recipientTeamId: registration.teamId,
        recipientUserId: registration.team.managerUserId,
        payload: { teamId: registration.teamId, teamName: registration.team.name },
        dedupeKey: `team-approved:${registration.teamId}`,
      });
      return { registrationId, outcome: "CONFIRMED" as const };
    }

    /* -------- RECHAZADO -------- */
    if (mappedStatus === "REJECTED") {
      if (!alreadyConfirmed) {
        await tx.registration.update({
          where: { id: registrationId },
          data: { status: "PAYMENT_REJECTED" },
        });
        await tx.team.update({
          where: { id: registration.teamId },
          data: { paymentStatus: "REJECTED" },
        });
        await writeAudit(tx, {
          ...auditBase,
          action: "payment.rejected",
          newValue: { mpPaymentId, detail: payment.status_detail },
        });
      }
      return { registrationId, outcome: "REJECTED" as const };
    }

    /* -------- DEVUELTO / CONTRACARGO -------- */
    if (mappedStatus === "REFUNDED") {
      await tx.registration.update({
        where: { id: registrationId },
        data: { status: "OBSERVED" },
      });
      await tx.team.update({
        where: { id: registration.teamId },
        data: { paymentStatus: "REFUNDED", registrationStatus: "OBSERVED" },
      });
      await writeAudit(tx, {
        ...auditBase,
        action: "payment.refunded",
        previousValue: { status: registration.status },
        newValue: { mpPaymentId, mpStatus: payment.status },
      });
      await enqueueNotification(tx, {
        type: "RESULT_POSTED",
        recipientTeamId: registration.teamId,
        payload: { kind: "payment_refunded", teamId: registration.teamId },
        dedupeKey: `payment-refunded:${mpPaymentId}`,
      });
      return { registrationId, outcome: "REFUNDED" as const };
    }

    /* -------- PENDIENTE / EN PROCESO -------- */
    if (!alreadyConfirmed) {
      await tx.team.update({
        where: { id: registration.teamId },
        data: { paymentStatus: "PENDING" },
      });
    }
    return { registrationId, outcome: "PENDING" as const };
  });
}

/* ============================================================
 *  Webhook
 * ============================================================ */

export interface WebhookInput {
  dataId: string;
  topic: string;
  xSignature: string | null;
  xRequestId: string | null;
  rawBody: unknown;
}

export interface WebhookResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

export async function processPaymentWebhook(input: WebhookInput): Promise<WebhookResult> {
  const { dataId, topic } = input;

  const sig = verifyWebhookSignature({
    xSignature: input.xSignature,
    xRequestId: input.xRequestId,
    dataId,
  });
  if (!sig.valid) {
    return { httpStatus: 401, body: { error: "firma inválida", reason: sig.reason } };
  }
  if (sig.skipped) {
    console.warn("[mercadopago] webhook sin MP_WEBHOOK_SECRET — firma NO verificada (solo dev)");
  }

  // Idempotencia: registrar el evento antes de procesarlo.
  const existing = await db.webhookEvent.findUnique({
    where: {
      provider_topic_resourceId: { provider: "mercadopago", topic, resourceId: dataId },
    },
  });
  if (existing && (existing.status === "PROCESSED" || existing.status === "IGNORED")) {
    return { httpStatus: 200, body: { ok: true, idempotent: true } };
  }
  if (!existing) {
    await db.webhookEvent.create({
      data: {
        provider: "mercadopago",
        topic,
        resourceId: dataId,
        status: "RECEIVED",
        payload: (input.rawBody ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  const markEvent = (status: "PROCESSED" | "IGNORED" | "ERROR", error?: string) =>
    db.webhookEvent.update({
      where: {
        provider_topic_resourceId: { provider: "mercadopago", topic, resourceId: dataId },
      },
      data: { status, error: error ?? null, processedAt: new Date() },
    });

  if (topic !== "payment") {
    await markEvent("IGNORED", `topic no manejado: ${topic}`);
    return { httpStatus: 200, body: { ok: true, ignored: true } };
  }

  try {
    const payment = await getPayment(dataId);
    const result = await applyMpPayment(payment);
    await markEvent(result.outcome === "NOOP" ? "IGNORED" : "PROCESSED");
    return { httpStatus: 200, body: { ok: true, outcome: result.outcome } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Un 404 de MP (id inexistente) no se va a resolver reintentando.
    if (err instanceof MercadoPagoError && err.status === 404) {
      await markEvent("IGNORED", "pago inexistente en Mercado Pago").catch(() => {});
      return { httpStatus: 200, body: { ok: true, ignored: true } };
    }
    await markEvent("ERROR", message).catch(() => {});
    console.error("[mercadopago] error procesando webhook", message);
    // 500 → MP reintenta.
    return { httpStatus: 500, body: { error: "error procesando el pago" } };
  }
}

/* ============================================================
 *  Reconciliación (cron)
 * ============================================================ */

export async function reconcilePendingPayments(opts: { olderThanMinutes?: number } = {}): Promise<{
  checked: number;
  updated: number;
}> {
  const cutoff = new Date(Date.now() - (opts.olderThanMinutes ?? 15) * 60_000);
  const horizon = new Date(Date.now() - 72 * 60 * 60_000);

  const stuck = await db.registration.findMany({
    where: {
      status: { in: ["PAYMENT_STARTED", "PENDING_PAYMENT"] },
      updatedAt: { lt: cutoff, gt: horizon },
    },
    select: { id: true },
    take: 200,
  });

  let updated = 0;
  for (const reg of stuck) {
    try {
      const payments = await searchPaymentsByReference(reg.id);
      const relevant =
        payments.find((p) => p.status === "approved") ??
        payments.find((p) => p.status === "rejected") ??
        payments[0];
      if (!relevant) continue;
      const res = await applyMpPayment(relevant);
      if (res.outcome !== "PENDING" && res.outcome !== "NOOP") updated++;
    } catch (err) {
      console.error("[reconcile] error con", reg.id, err instanceof Error ? err.message : err);
    }
  }

  return { checked: stuck.length, updated };
}
