import "server-only";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/send";
import { renderNotification } from "@/lib/email/templates";

/**
 * Procesa la cola de notificaciones (Notification en estado QUEUED): resuelve el
 * destinatario, renderiza el email y lo envía. Marca SENT / FAILED / SKIPPED.
 * Se dispara desde el cron `/api/cron/notifications` y se puede llamar tras
 * encolar para envío inmediato.
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
        data: { status: "SENT", sentAt: new Date() },
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
