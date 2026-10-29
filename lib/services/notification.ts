import "server-only";
import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { dispatchNotificationsSoon } from "@/lib/services/notification-dispatch";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface NotificationIntent {
  type: NotificationType;
  recipientUserId?: string | null;
  recipientTeamId?: string | null;
  /** Destino fijo (no es un User/Team) — lo usan los avisos a la organización. */
  recipientEmail?: string | null;
  payload: Prisma.InputJsonValue;
  /** Clave única para evitar duplicados (ej. `payment-approved:<paymentId>`). */
  dedupeKey?: string;
}

/**
 * Encola una notificación (estado QUEUED). Debe llamarse dentro de la transacción
 * de la mutación que la origina. El envío sale apenas termina el request
 * (`dispatchNotificationsSoon`, vía `after`); si la transacción se revierte, ese
 * despacho no encuentra nada nuevo. El cron `/api/cron/notifications` queda como
 * red de seguridad para lo que no haya salido.
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
      recipientEmail: intent.recipientEmail ?? null,
      payload: intent.payload,
      dedupeKey: intent.dedupeKey ?? null,
    },
  });
  dispatchNotificationsSoon();
}
