import "server-only";
import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface NotificationIntent {
  type: NotificationType;
  recipientUserId?: string | null;
  recipientTeamId?: string | null;
  payload: Prisma.InputJsonValue;
  /** Clave única para evitar duplicados (ej. `payment-approved:<paymentId>`). */
  dedupeKey?: string;
}

/**
 * Encola una notificación (estado QUEUED). El envío efectivo por email y las
 * integraciones futuras (WhatsApp, push) se implementan en la Fase 6 sobre
 * esta cola. Debe llamarse dentro de la transacción de la mutación que la origina.
 */
export async function enqueueNotification(tx: Tx, intent: NotificationIntent): Promise<void> {
  if (intent.dedupeKey) {
    const existing = await tx.notification.findUnique({ where: { dedupeKey: intent.dedupeKey } });
    if (existing) return;
  }
  await tx.notification.create({
    data: {
      type: intent.type,
      channel: "EMAIL",
      status: "QUEUED",
      recipientUserId: intent.recipientUserId ?? null,
      recipientTeamId: intent.recipientTeamId ?? null,
      payload: intent.payload,
      dedupeKey: intent.dedupeKey ?? null,
    },
  });
}
