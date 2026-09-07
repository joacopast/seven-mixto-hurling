import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { dispatchQueuedNotifications } from "@/lib/services/notification-dispatch";
import { enqueueNotification } from "@/lib/services/notification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Procesa la cola de emails y encola avisos de "partido próximo" para los
 * partidos que arrancan en la próxima ventana. Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  // Avisos de partido próximo (arranca en 20–45 min y aún no notificado).
  let upcomingEnqueued = 0;
  try {
    const tournament = await getActiveTournament();
    const from = new Date(Date.now() + 20 * 60_000);
    const to = new Date(Date.now() + 45 * 60_000);
    const matches = await db.match.findMany({
      where: {
        tournamentId: tournament.id,
        status: "SCHEDULED",
        slot: { round: { startsAt: { gte: from, lte: to } } },
      },
      include: {
        slot: { include: { round: true, field: true } },
        homeTeam: { select: { id: true, name: true, managerUserId: true } },
        awayTeam: { select: { id: true, name: true, managerUserId: true } },
        group: { select: { name: true } },
        cup: { select: { name: true } },
      },
    });

    await db.$transaction(async (tx) => {
      for (const m of matches) {
        const label = m.group
          ? `Grupo ${m.group.name}`
          : m.cup
            ? `Copa ${m.cup.name}`
            : "partido";
        for (const team of [m.homeTeam, m.awayTeam]) {
          if (!team) continue;
          await enqueueNotification(tx, {
            type: "MATCH_UPCOMING",
            recipientTeamId: team.id,
            recipientUserId: team.managerUserId,
            payload: {
              teamName: team.name,
              matchLabel: label,
              startsAt: m.slot?.round.startsAt.toISOString(),
              fieldName: m.slot?.field.name,
            },
            dedupeKey: `match-upcoming:${m.id}:${team.id}`,
          });
          upcomingEnqueued++;
        }
      }
    });
  } catch {
    // Si no hay torneo activo o fixture, seguimos con el envío igual.
  }

  const result = await dispatchQueuedNotifications();
  return NextResponse.json({ ok: true, upcomingEnqueued, ...result });
}
