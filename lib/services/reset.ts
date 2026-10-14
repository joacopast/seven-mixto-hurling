import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";

export interface ResetSummary {
  teams: number;
  matches: number;
  groups: number;
  cups: number;
}

/**
 * Vacía un torneo para reusarlo en una edición nueva: borra equipos, jugadores,
 * inscripciones, pagos, grupos, copas, llaves, partidos y notificaciones; deja
 * `Tournament`/`TournamentConfig` intactos (mismo id/slug) con el estado en
 * `SETUP`. El `AuditLog` NO se borra — queda como historial de la edición
 * anterior (su FK a Tournament es `ON DELETE SET NULL`, no se ve afectado).
 *
 * Las FKs reversas (Team.groupId, Match.homeTeamId, BracketMatch.matchId, …)
 * son todas `ON DELETE SET NULL` en el schema — no hay orden estricto que
 * respetar, pero se borra de forma explícita y completa igual, sin depender
 * de cascadas implícitas que no se puedan leer a simple vista acá.
 */
export async function resetTournament(
  tournamentId: string,
  ctx: { userId?: string | null; ip?: string | null } = {},
): Promise<ResetSummary> {
  return db.$transaction(async (tx) => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw new Error("Torneo no encontrado.");

    const teamIds = (
      await tx.team.findMany({ where: { tournamentId }, select: { id: true } })
    ).map((t) => t.id);

    const [teams, matches, groups, cups] = await Promise.all([
      tx.team.count({ where: { tournamentId } }),
      tx.match.count({ where: { tournamentId } }),
      tx.group.count({ where: { tournamentId } }),
      tx.cup.count({ where: { tournamentId } }),
    ]);

    if (teamIds.length > 0) {
      // Notification.recipientTeamId no tiene FK — se borra a mano o quedan huérfanas.
      await tx.notification.deleteMany({ where: { recipientTeamId: { in: teamIds } } });
    }

    await tx.team.deleteMany({ where: { tournamentId } }); // cascada: Player, Registration → Payment, GroupTeam
    await tx.group.deleteMany({ where: { tournamentId } }); // cascada: GroupTeam
    await tx.cup.deleteMany({ where: { tournamentId } }); // cascada: Bracket → BracketMatch
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.round.deleteMany({ where: { tournamentId } }); // cascada: MatchSlot
    await tx.field.deleteMany({ where: { tournamentId } });

    await tx.tournament.update({ where: { id: tournamentId }, data: { status: "SETUP" } });

    await writeAudit(tx, {
      tournamentId,
      userId: ctx.userId,
      action: "tournament.reset",
      entity: "Tournament",
      entityId: tournamentId,
      previousValue: { name: tournament.name, edition: tournament.edition, teams, matches, groups, cups },
      newValue: null,
      ip: ctx.ip ?? null,
    });

    return { teams, matches, groups, cups };
  });
}
