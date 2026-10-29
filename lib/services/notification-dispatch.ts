import "server-only";
import { after } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { renderNotification } from "@/lib/email/templates";

/**
 * Procesa la cola de notificaciones (Notification en estado QUEUED): resuelve el
 * destinatario, renderiza el email y lo envía. Marca SENT / FAILED / SKIPPED.
 * Se dispara justo después de cada request que encola (`dispatchNotificationsSoon`,
 * llamado desde `enqueueNotification`) y, como red de seguridad, desde el cron
 * `/api/cron/notifications`.
 *
 * Puede correr en paralelo (cron + varios requests, incluso en instancias distintas):
 * cada fila se "reclama" con un update condicional QUEUED → SENT antes de enviarla,
 * así un email nunca sale dos veces. Una fila SENT con `sentAt` null = reclamada pero
 * el envío no terminó (la función murió en el medio).
 */
export async function dispatchQueuedNotifications(limit = 50): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const pending = await db.notification.findMany({
    where: { status: "QUEUED", channel: "EMAIL" },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: {
      recipientUser: { select: { email: true } },
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const n of pending) {
    const claimed = await db.notification.updateMany({
      where: { id: n.id, status: "QUEUED" },
      data: { status: "SENT", sentAt: null },
    });
    if (claimed.count === 0) continue; // la tomó otro dispatch

    let to = n.recipientEmail ?? n.recipientUser?.email ?? null;
    if (!to && n.recipientTeamId) {
      const team = await db.team.findUnique({
        where: { id: n.recipientTeamId },
        select: { contactEmail: true, name: true },
      });
      to = team?.contactEmail ?? null;
    }

    const payload = (n.payload ?? {}) as Record<string, unknown>;
    let teamName = payload.teamName as string | undefined;
    if (!teamName && n.recipientTeamId) {
      const t = await db.team.findUnique({ where: { id: n.recipientTeamId }, select: { name: true } });
      teamName = t?.name;
    }

    if (!to) {
      await db.notification.update({
        where: { id: n.id },
        data: { status: "SKIPPED", error: "sin destinatario" },
      });
      skipped++;
      continue;
    }

    try {
      const email = renderNotification(n.type, {
        teamName,
        amount: typeof payload.amount === "number" ? payload.amount : undefined,
        expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : undefined,
        matchLabel: typeof payload.matchLabel === "string" ? payload.matchLabel : undefined,
        startsAt: typeof payload.startsAt === "string" ? payload.startsAt : undefined,
        fieldName: typeof payload.fieldName === "string" ? payload.fieldName : undefined,
        extra: payload,
      });
      await sendEmail({ to, subject: email.subject, html: email.html, text: email.text });
      await db.notification.update({
        where: { id: n.id },
        data: { sentAt: new Date() },
      });
      sent++;
    } catch (err) {
      await db.notification.update({
        where: { id: n.id },
        data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 400) : "error" },
      });
      failed++;
    }
  }

  return { sent, failed, skipped };
}

/* ---------------- Envío inmediato ---------------- */

const BATCH = 50;
let inFlight: Promise<void> | null = null;
let rerun = false;

/** Una sola corrida por instancia; si llegan más encolados mientras corre, repite. */
function runDispatch(): Promise<void> {
  if (inFlight) {
    rerun = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      let processed: number;
      do {
        rerun = false;
        const r = await dispatchQueuedNotifications(BATCH);
        processed = r.sent + r.failed + r.skipped;
      } while (rerun || processed >= BATCH);
    } catch (err) {
      console.error("[notifications] envío inmediato falló (queda para el cron)", err);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Agenda el despacho de la cola para después de responder el request actual
 * (`after` de Next: en Vercel corre con waitUntil, la respuesta no espera el SMTP).
 * Fuera de un request (tests, scripts, seed) `after` tira error: se ignora y lo
 * encolado queda para el cron.
 */
export function dispatchNotificationsSoon(): void {
  try {
    after(runDispatch);
  } catch {
    /* fuera de un request */
  }
}
