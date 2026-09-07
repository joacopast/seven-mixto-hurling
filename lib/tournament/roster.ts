/**
 * Validación del plantel — función pura. Ver docs/arquitectura.html §3 y §6.
 *
 * Distingue explícitamente:
 *  a) composición del PLANTEL (lo que valida la inscripción)
 *  b) composición permitida EN CANCHA (regla del juego, informativa acá)
 */

export type Gender = "M" | "F" | "X";

export interface RosterConfig {
  minPlayers: number;
  maxPlayers: number;
  /** Jugadores en cancha (regla del juego, no del plantel). */
  playersOnField: number;
  /** Máximo de hombres en cancha (regla del juego, no del plantel). */
  maxMenOnField: number;
  /** Edad mínima al primer día del torneo. */
  minPlayerAge: number;
}

export interface RosterPlayerInput {
  firstName: string;
  lastName: string;
  docNumber: string;
  birthDate: Date;
  gender: Gender;
  shirtNumber?: number | null;
}

export type RosterIssueCode =
  | "TOO_FEW_PLAYERS"
  | "TOO_MANY_PLAYERS"
  | "DUPLICATE_DOC"
  | "DUPLICATE_SHIRT"
  | "UNDERAGE"
  | "MISSING_FIELD"
  | "NOT_ENOUGH_WOMEN_FOR_FIELD";

export interface RosterIssue {
  code: RosterIssueCode;
  message: string;
  /** Índice del jugador afectado, si aplica. */
  playerIndex?: number;
  /** true = impide confirmar la inscripción. false = advertencia. */
  blocking: boolean;
}

export interface RosterValidation {
  ok: boolean;
  issues: RosterIssue[];
  counts: {
    total: number;
    men: number;
    women: number;
    other: number;
  };
}

/**
 * Edad cumplida en una fecha de referencia.
 * Usa componentes UTC para ser determinista sin importar la zona horaria del server
 * (las fechas de nacimiento se guardan como DateTime a medianoche UTC).
 */
export function ageOn(birthDate: Date, reference: Date): number {
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = reference.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && reference.getUTCDate() < birthDate.getUTCDate())) {
    age--;
  }
  return age;
}

export function validateRoster(
  config: RosterConfig,
  players: RosterPlayerInput[],
  opts: { referenceDate?: Date } = {},
): RosterValidation {
  const referenceDate = opts.referenceDate ?? new Date();
  const issues: RosterIssue[] = [];

  const counts = { total: players.length, men: 0, women: 0, other: 0 };
  for (const p of players) {
    if (p.gender === "M") counts.men++;
    else if (p.gender === "F") counts.women++;
    else counts.other++;
  }

  // Tamaño del plantel
  if (players.length < config.minPlayers) {
    issues.push({
      code: "TOO_FEW_PLAYERS",
      message: `El plantel necesita al menos ${config.minPlayers} jugadores (tiene ${players.length}).`,
      blocking: true,
    });
  }
  if (players.length > config.maxPlayers) {
    issues.push({
      code: "TOO_MANY_PLAYERS",
      message: `El plantel admite como máximo ${config.maxPlayers} jugadores (tiene ${players.length}).`,
      blocking: true,
    });
  }

  // Campos obligatorios + edad + duplicados
  const seenDocs = new Map<string, number>();
  const seenShirts = new Map<number, number>();

  players.forEach((p, index) => {
    const doc = normalizeDoc(p.docNumber);

    if (!p.firstName?.trim() || !p.lastName?.trim() || !doc) {
      issues.push({
        code: "MISSING_FIELD",
        message: "Nombre, apellido y documento son obligatorios.",
        playerIndex: index,
        blocking: true,
      });
    }

    if (p.birthDate instanceof Date && !Number.isNaN(p.birthDate.getTime())) {
      const age = ageOn(p.birthDate, referenceDate);
      if (age < config.minPlayerAge) {
        issues.push({
          code: "UNDERAGE",
          message: `${p.firstName} ${p.lastName} no cumple la edad mínima de ${config.minPlayerAge} años.`,
          playerIndex: index,
          blocking: true,
        });
      }
    } else {
      issues.push({
        code: "MISSING_FIELD",
        message: "La fecha de nacimiento es obligatoria.",
        playerIndex: index,
        blocking: true,
      });
    }

    if (doc) {
      const firstSeen = seenDocs.get(doc);
      if (firstSeen !== undefined) {
        issues.push({
          code: "DUPLICATE_DOC",
          message: `El documento ${p.docNumber} está cargado más de una vez en este equipo.`,
          playerIndex: index,
          blocking: true,
        });
      } else {
        seenDocs.set(doc, index);
      }
    }

    if (p.shirtNumber != null) {
      const firstSeen = seenShirts.get(p.shirtNumber);
      if (firstSeen !== undefined) {
        issues.push({
          code: "DUPLICATE_SHIRT",
          message: `El número ${p.shirtNumber} está repetido.`,
          playerIndex: index,
          blocking: false,
        });
      } else {
        seenShirts.set(p.shirtNumber, index);
      }
    }
  });

  // Advertencia: ¿puede completar la cancha respetando el máximo de hombres?
  const minWomenNeededOnField = Math.max(0, config.playersOnField - config.maxMenOnField);
  if (players.length >= config.minPlayers && counts.women + counts.other < minWomenNeededOnField) {
    issues.push({
      code: "NOT_ENOUGH_WOMEN_FOR_FIELD",
      message:
        `Con esta composición no se llega a ${config.playersOnField} en cancha ` +
        `respetando el máximo de ${config.maxMenOnField} hombres. ` +
        `Se necesitan al menos ${minWomenNeededOnField} jugadoras.`,
      blocking: false,
    });
  }

  return {
    ok: !issues.some((i) => i.blocking),
    issues,
    counts,
  };
}

function normalizeDoc(doc: string): string {
  return (doc ?? "").replace(/[.\s-]/g, "").trim().toUpperCase();
}
