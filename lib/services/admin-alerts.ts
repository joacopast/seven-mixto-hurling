import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { enqueueNotification } from "@/lib/services/notification";

type Tx = Prisma.TransactionClient | PrismaClient;

const DEFAULT_ADMIN_NOTIFICATION_EMAILS = "aftersevenmixto@gmail.com";

function adminNotificationEmails(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAILS || DEFAULT_ADMIN_NOTIFICATION_EMAILS;
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface AdminAlertInput {
  /** Línea corta, ej. "Pago confirmado — Argentina". */
  title: string;
  /** Detalle en líneas simples, ej. ["Monto: $330.000", "Responsable: Aoife Byrne"]. */
  lines: string[];
  teamId?: string | null;
  teamName?: string | null;
  /** Única por evento (no por destinatario — acá se le agrega el email). */
  dedupeKey?: string;
}

/**
 * Avisa por email a la organización (`ADMIN_NOTIFICATION_EMAILS`, por defecto
 * aftersevenmixto@gmail.com) de un cambio en equipos, pagos o inscripciones.
 * Se encola como `Notification` (igual que los avisos a los equipos) y lo
 * despacha el mismo cron `/api/cron/notifications` — llamar siempre DENTRO de
 * la transacción de la mutación que lo origina.
 */
export async function notifyAdmin(tx: Tx, input: AdminAlertInput): Promise<void> {
  for (const email of adminNotificationEmails()) {
    await enqueueNotification(tx, {
      type: "ADMIN_ALERT",
      recipientEmail: email,
      payload: {
        title: input.title,
        lines: input.lines,
        teamId: input.teamId ?? null,
        teamName: input.teamName ?? null,
      },
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${email}` : undefined,
    });
  }
}
