import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { enqueueNotification } from "@/lib/services/notification";

export class ScheduleError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "INVALID_DATE",
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

export interface RescheduleResult {
  shiftedRounds: number;
  deltaMinutes: number;
  notifiedTeams: number;
}

/**
 * Reprograma el horario de una tanda (`Round`, fase de grupos o copas) y
 * corre en cascada el mismo delta sobre todas las tandas que arrancan
 * después — de cualquier fase, porque físicamente es el mismo día y las
 * mismas canchas — para no tener que reprogramarlas una por una a mano.
 * Avisa por email (`TIME_CHANGED`) a los equipos con partidos afectados,
 * usando el nuevo horario de su primer partido afectado.
 */
export async function rescheduleRound(
  roundId: string,
  newStartsAt: Date,
  ctx: { userId?: string | null; ip?: string | null } = {},
): Promise<RescheduleResult> {
  if (Number.isNaN(newStartsAt.getTime())) {
    throw new ScheduleError("Fecha inválida.", "INVALID_DATE");
  }

  const round = await db.round.findUnique({ where: { id: roundId } });
  if (!round) throw new ScheduleError("Tanda no encontrada.", "NOT_FOUND");

  const deltaMs = newStartsAt.getTime() - round.startsAt.getTime();
  if (deltaMs === 0) return { shiftedRounds: 0, deltaMinutes: 0, notifiedTeams: 0 };

  const laterRounds = await db.round.findMany({
    where: { tournamentId: round.tournamentId, startsAt: { gt: round.startsAt } },
    orderBy: { startsAt: "asc" },
  });
  const affectedRounds = [round, ...laterRounds];
  const affectedRoundIds = affectedRounds.map((r) => r.id);

  // Equipos con partidos en las tandas afectadas — un aviso por equipo, con
  // el horario de su primer partido afectado (el más próximo).
  const slots = await db.matchSlot.findMany({
    where: { roundId: { in: affectedRoundIds } },
    include: { match: { select: { homeTeamId: true, awayTeamId: true } } },
  });
  const roundById = new Map(affectedRounds.map((r) => [r.id, r]));
  const nextStartsAtByTeam = new Map<string, Date>();
  for (const slot of slots) {
    const r = roundById.get(slot.roundId)!;
    const newRoundStartsAt = new Date(r.startsAt.getTime() + deltaMs);
    for (const teamId of [slot.match?.homeTeamId, slot.match?.awayTeamId]) {
      if (!teamId) continue;
      const current = nextStartsAtByTeam.get(teamId);
      if (!current || newRoundStartsAt < current) nextStartsAtByTeam.set(teamId, newRoundStartsAt);
    }
  }

  const teams = nextStartsAtByTeam.size
    ? await db.team.findMany({
        where: { id: { in: [...nextStartsAtByTeam.keys()] } },
        select: { id: true, name: true, managerUserId: true },
      })
    : [];

  await db.$transaction(async (tx) => {
    await tx.round.update({ where: { id: round.id }, data: { startsAt: newStartsAt } });
    for (const r of laterRounds) {
      await tx.round.update({
        where: { id: r.id },
        data: { startsAt: new Date(r.startsAt.getTime() + deltaMs) },
      });
    }

    await writeAudit(tx, {
      tournamentId: round.tournamentId,
      userId: ctx.userId,
      action: "round.reschedule",
      entity: "Round",
      entityId: round.id,
      previousValue: { startsAt: round.startsAt.toISOString() },
      newValue: {
        startsAt: newStartsAt.toISOString(),
        deltaMinutes: Math.round(deltaMs / 60_000),
        shiftedRounds: laterRounds.length,
      },
      ip: ctx.ip ?? null,
    });

    for (const team of teams) {
      const startsAt = nextStartsAtByTeam.get(team.id)!;
      await enqueueNotification(tx, {
        type: "TIME_CHANGED",
        recipientTeamId: team.id,
        recipientUserId: team.managerUserId,
        payload: { teamId: team.id, teamName: team.name, startsAt: startsAt.toISOString() },
        dedupeKey: `time-changed:${round.id}:${team.id}:${newStartsAt.getTime()}`,
      });
    }
  });

  return {
    shiftedRounds: laterRounds.length,
    deltaMinutes: Math.round(deltaMs / 60_000),
    notifiedTeams: teams.length,
  };
}
