import "server-only";
import { db } from "@/lib/db";
import { ageOn } from "@/lib/tournament/roster";
import { updatePlayer, AdminTeamError, type AdminPlayerInput } from "@/lib/services/admin-teams";

export class RosterSelfError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "FORBIDDEN" | "LOCKED" | "DUP_DOC" | "TOO_YOUNG",
  ) {
    super(message);
    this.name = "RosterSelfError";
  }
}

/**
 * Edición de un jugador por el responsable del equipo (portal `/mi-equipo`):
 * corrige datos (nombre, documento, fecha de nacimiento, etc.) de alguien ya
 * cargado. No agrega ni saca jugadores — no toca el precio de la inscripción.
 * Chequea que el jugador sea del equipo del que llama, y que el plantel
 * todavía no esté bloqueado (`TournamentConfig.rosterLockAt`).
 */
export async function updateMyPlayer(
  playerId: string,
  managerUserId: string,
  input: AdminPlayerInput,
  ctx: { ip?: string | null } = {},
): Promise<void> {
  const player = await db.player.findUnique({
    where: { id: playerId },
    include: { team: { include: { tournament: { include: { config: true } } } } },
  });
  if (!player) throw new RosterSelfError("Jugador no encontrado.", "NOT_FOUND");
  if (player.team.managerUserId !== managerUserId) {
    throw new RosterSelfError("Ese jugador no es de tu equipo.", "FORBIDDEN");
  }

  const config = player.team.tournament.config;
  const lockAt = config?.rosterLockAt;
  if (lockAt && new Date() > lockAt) {
    throw new RosterSelfError(
      "El plantel ya está cerrado para ediciones — escribile a la organización si hace falta un cambio.",
      "LOCKED",
    );
  }

  const minAge = config?.minPlayerAge ?? 0;
  const reference = player.team.tournament.startDate ?? new Date();
  const birthDate = new Date(`${input.birthDate}T00:00:00Z`);
  if (ageOn(birthDate, reference) < minAge) {
    throw new RosterSelfError(`No cumple la edad mínima de ${minAge} años.`, "TOO_YOUNG");
  }

  try {
    await updatePlayer(playerId, input, { userId: managerUserId, ip: ctx.ip });
  } catch (err) {
    if (err instanceof AdminTeamError && err.code === "DUP_DOC") {
      throw new RosterSelfError(err.message, "DUP_DOC");
    }
    throw err;
  }
}
