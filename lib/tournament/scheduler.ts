/**
 * Asignación de partidos a tandas y canchas — función pura.
 * Ver docs/arquitectura.html §3 (scheduleSlots) y §9 (MATCH_SLOT).
 *
 * Regla dura: un equipo nunca tiene dos partidos en la misma tanda.
 * Objetivo: usar todas las canchas y terminar en la menor cantidad de tandas.
 */

export interface WaterBreakConfig {
  /** Cada cuántas tandas (≈ partidos por cancha) insertar la pausa. 0 = sin pausas. */
  everyTandas: number;
  /** Duración de la pausa, en minutos. */
  minutes: number;
}

export interface SchedulerConfig {
  fieldCount: number;
  matchDurationMin: number;
  turnoverMin: number;
  /** Inicio de la primera tanda. */
  startsAt: Date;
  /** Pausa para regar la cancha, cada N tandas. */
  waterBreak?: WaterBreakConfig | null;
  /**
   * Tandas ya jugadas antes de esta llamada (para que el conteo de la pausa
   * de riego siga entre fases/rondas en vez de reiniciarse en cada llamada).
   */
  tandasBefore?: number;
}

export interface SchedulableMatch {
  /** Identificador propio del partido (índice, id temporal, etc.). */
  ref: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Partidos con la misma clave se intentan poner en la misma tanda (ej. `${groupId}:${round}`). */
  unitKey: string;
  /** Orden relativo deseado (ej. número de fecha del grupo). */
  order: number;
}

export interface ScheduledMatch extends SchedulableMatch {
  tanda: number;
  /** Cancha 1-indexada. */
  field: number;
  startsAt: Date;
}

export interface Schedule {
  matches: ScheduledMatch[];
  tandaCount: number;
  tandaStartTimes: Date[];
  /** Tandas acumuladas incluyendo esta llamada — pasar como `tandasBefore` a la siguiente. */
  tandasElapsed: number;
}

/**
 * Empaqueta los partidos en tandas: recorre las "unidades" (grupo-fecha) en
 * orden y las mete en la primera tanda que tenga canchas libres y sin choque
 * de equipos. Dentro de una unidad los partidos ya no comparten equipos.
 */
export function scheduleMatches(config: SchedulerConfig, matches: SchedulableMatch[]): Schedule {
  const slotMinutes = config.matchDurationMin + config.turnoverMin;
  const tandasBefore = config.tandasBefore ?? 0;
  const everyTandas = config.waterBreak?.everyTandas ?? 0;
  const breakMinutes = config.waterBreak?.minutes ?? 0;

  // Minutos de pausa de riego ya acumulados antes de la tanda `localIndex`
  // (0-indexada dentro de esta llamada) — sigue el conteo entre llamadas
  // vía `tandasBefore`, así la pausa no se reinicia en cada fase/ronda.
  const breakMinutesBefore = (localIndex: number): number => {
    if (everyTandas <= 0 || breakMinutes <= 0) return 0;
    return Math.floor((tandasBefore + localIndex) / everyTandas) * breakMinutes;
  };

  // Agrupar por unidad, conservando el orden pedido.
  const units = new Map<string, SchedulableMatch[]>();
  for (const m of matches) {
    const u = units.get(m.unitKey) ?? [];
    u.push(m);
    units.set(m.unitKey, u);
  }
  const orderedUnits = [...units.values()].sort((a, b) => {
    const ao = Math.min(...a.map((m) => m.order));
    const bo = Math.min(...b.map((m) => m.order));
    if (ao !== bo) return ao - bo;
    return a[0]!.unitKey.localeCompare(b[0]!.unitKey);
  });

  interface Tanda {
    matches: ScheduledMatch[];
    teams: Set<string>;
  }
  const tandas: Tanda[] = [];

  const fits = (tanda: Tanda, unit: SchedulableMatch[]): boolean => {
    if (tanda.matches.length + unit.length > config.fieldCount) return false;
    for (const m of unit) {
      if (tanda.teams.has(m.homeTeamId) || tanda.teams.has(m.awayTeamId)) return false;
    }
    return true;
  };

  const place = (tandaIndex: number, unit: SchedulableMatch[]) => {
    while (tandas.length <= tandaIndex) tandas.push({ matches: [], teams: new Set() });
    const tanda = tandas[tandaIndex]!;
    for (const m of unit) {
      const field = tanda.matches.length + 1;
      tanda.matches.push({
        ...m,
        tanda: tandaIndex,
        field,
        startsAt: new Date(
          config.startsAt.getTime() +
            tandaIndex * slotMinutes * 60_000 +
            breakMinutesBefore(tandaIndex) * 60_000,
        ),
      });
      tanda.teams.add(m.homeTeamId);
      tanda.teams.add(m.awayTeamId);
    }
  };

  for (const unit of orderedUnits) {
    if (unit.length > config.fieldCount) {
      throw new Error(
        `Una unidad tiene ${unit.length} partidos y hay ${config.fieldCount} canchas.`,
      );
    }
    let placed = false;
    for (let t = 0; t < tandas.length; t++) {
      if (fits(tandas[t]!, unit)) {
        place(t, unit);
        placed = true;
        break;
      }
    }
    if (!placed) place(tandas.length, unit);
  }

  const scheduled = tandas.flatMap((t) => t.matches);
  return {
    matches: scheduled,
    tandaCount: tandas.length,
    tandaStartTimes: tandas.map(
      (_, i) =>
        new Date(config.startsAt.getTime() + i * slotMinutes * 60_000 + breakMinutesBefore(i) * 60_000),
    ),
    tandasElapsed: tandasBefore + tandas.length,
  };
}
