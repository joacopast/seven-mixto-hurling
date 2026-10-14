import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { enqueueNotification } from "@/lib/services/notification";
import { assignCups, type GroupStageRecord } from "@/lib/tournament/cups";
import {
  buildSingleElimBracket,
  avoidSameGroupOctavos,
  ROUND_ORDER,
  ROUND_LABEL,
  type BracketRoundName,
} from "@/lib/tournament/bracket";
import { scheduleMatches } from "@/lib/tournament/scheduler";
import type { BracketRound, Prisma } from "@prisma/client";

export class CupsError extends Error {
  constructor(
    message: string,
    public code:
      | "WRONG_STATUS"
      | "GROUPS_NOT_FINISHED"
      | "HAS_CUP_RESULTS"
      | "MATCH_NOT_FOUND"
      | "TEAMS_NOT_READY"
      | "BAD_INPUT"
      | "NEEDS_CASCADE_CONFIRM",
  ) {
    super(message);
    this.name = "CupsError";
  }
}

interface Ctx {
  userId?: string | null;
  ip?: string | null;
}

const BRACKET_ROUND: Record<BracketRoundName, BracketRound> = {
  OCTAVOS: "OCTAVOS",
  CUARTOS: "CUARTOS",
  SEMIS: "SEMIS",
  FINAL: "FINAL",
};

/** Descanso entre el fin de la fase de grupos y el arranque de las copas. */
const CUP_PHASE_BREAK_MIN = 40;

/* ============================================================
 *  Generar copas
 * ============================================================ */

export async function generateCups(tournamentId: string, ctx: Ctx = {}): Promise<{
  cups: { name: string; teams: number }[];
  matches: number;
}> {
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      config: true,
      groups: { include: { groupTeams: true }, orderBy: { order: "asc" } },
      fields: { orderBy: { order: "asc" } },
      rounds: { where: { phase: "GROUP" }, orderBy: { order: "desc" }, take: 1 },
    },
  });
  if (!tournament?.config) throw new CupsError("Falta configuración.", "WRONG_STATUS");
  if (!["GROUPS_PUBLISHED", "GROUPS_IN_PROGRESS", "CUPS_PUBLISHED"].includes(tournament.status)) {
    throw new CupsError("Las copas se generan al terminar la fase de grupos.", "WRONG_STATUS");
  }

  const pendingGroup = await db.match.count({
    where: { tournamentId, phase: "GROUP", status: { notIn: ["FINISHED", "WALKOVER"] } },
  });
  const totalGroup = await db.match.count({ where: { tournamentId, phase: "GROUP" } });
  if (totalGroup === 0 || pendingGroup > 0) {
    throw new CupsError(
      `Faltan ${pendingGroup} resultados de la fase de grupos.`,
      "GROUPS_NOT_FINISHED",
    );
  }

  const cupResults = await db.match.count({
    where: { tournamentId, phase: "CUP", status: { in: ["FINISHED", "WALKOVER"] } },
  });
  if (cupResults > 0) {
    throw new CupsError("Ya hay resultados de copa: no se regeneran las llaves.", "HAS_CUP_RESULTS");
  }

  // Registros de fase de grupos (rank ya calculado por el servicio de resultados).
  const records: GroupStageRecord[] = [];
  const groupOf = new Map<string, string>();
  for (const g of tournament.groups) {
    for (const gt of g.groupTeams) {
      groupOf.set(gt.teamId, g.name);
      records.push({
        teamId: gt.teamId,
        rank: gt.rank ?? 99,
        played: gt.played,
        points: gt.points,
        goalDiff: gt.goalDiff,
        goalsFor: gt.goalsFor,
        fairPlayPoints: gt.fairPlayPoints,
      });
    }
  }
  if (records.some((r) => r.rank === 99)) {
    throw new CupsError("Hay grupos sin posiciones calculadas.", "GROUPS_NOT_FINISHED");
  }

  const cupSize = tournament.groups.length;
  if (cupSize < 2 || (cupSize & (cupSize - 1)) !== 0) {
    throw new CupsError(
      `La cantidad de grupos (${cupSize}) debe ser potencia de 2 para armar llaves de eliminación directa.`,
      "WRONG_STATUS",
    );
  }

  const cupAssignments = assignCups(records, tournament.config.cupNames);

  // Cada copa necesita exactamente `cupSize` equipos (uno por grupo, en esa
  // posición). Si algún grupo tiene menos equipos que los demás, la copa más
  // baja (ej. Madera) queda con menos seeds — sin este chequeo, seedOrder()
  // recibiría un tamaño que no es potencia de 2 (o 0) para esa copa.
  const incomplete = cupAssignments.find((a) => a.seeds.length !== cupSize);
  if (incomplete) {
    throw new CupsError(
      `La copa "${incomplete.cupName}" tiene ${incomplete.seeds.length} equipo(s) en vez de ${cupSize} — ` +
        `revisá que todos los grupos tengan la misma cantidad de equipos.`,
      "WRONG_STATUS",
    );
  }

  // Horario base del arranque de copas.
  const lastGroupRound = tournament.rounds[0];
  const slotMin = tournament.config.matchDurationMin + tournament.config.turnoverMin;
  const cupStart = lastGroupRound
    ? new Date(
        lastGroupRound.startsAt.getTime() +
          (tournament.config.matchDurationMin + CUP_PHASE_BREAK_MIN) * 60_000,
      )
    : (tournament.startDate ?? new Date());

  const nodes = buildSingleElimBracket(cupSize);
  const fieldByOrder = new Map(tournament.fields.map((f) => [f.order, f.id]));

  await db.$transaction(
    async (tx) => {
      // Limpieza de una eventual generación previa (sin resultados).
      await tx.match.deleteMany({ where: { tournamentId, phase: "CUP" } });
      await tx.round.deleteMany({ where: { tournamentId, phase: "CUP" } });
      await tx.bracket.deleteMany({ where: { cup: { tournamentId } } });
      await tx.cup.deleteMany({ where: { tournamentId } });
      await tx.team.updateMany({ where: { tournamentId }, data: { cupId: null, finalPosition: null } });

      // Todos los partidos de copa, agrupados por ronda para agendarlos.
      const matchesByRound = new Map<BracketRoundName, string[]>();

      for (const assignment of cupAssignments) {
        const cup = await tx.cup.create({
          data: { tournamentId, name: assignment.cupName, tier: assignment.tier },
        });
        const bracket = await tx.bracket.create({
          data: { cupId: cup.id, type: "SINGLE_ELIM", size: 16 },
        });

        const orderedSeeds = avoidSameGroupOctavos(assignment.seeds, groupOf);
        const seedToTeam = new Map<number, string>(
          orderedSeeds.map((teamId, i) => [i + 1, teamId]),
        );

        await tx.team.updateMany({
          where: { id: { in: orderedSeeds } },
          data: { cupId: cup.id },
        });

        // Primer paso: crear Match + BracketMatch por nodo.
        const bmByNode = new Map<string, string>(); // nodeId -> BracketMatch.id
        for (const node of nodes) {
          const homeTeamId =
            node.home.type === "SEED" ? seedToTeam.get(Number(node.home.ref)) ?? null : null;
          const awayTeamId =
            node.away.type === "SEED" ? seedToTeam.get(Number(node.away.ref)) ?? null : null;

          const match = await tx.match.create({
            data: {
              tournamentId,
              phase: "CUP",
              cupId: cup.id,
              homeTeamId,
              awayTeamId,
              status: "SCHEDULED",
            },
          });
          const bm = await tx.bracketMatch.create({
            data: {
              bracketId: bracket.id,
              round: BRACKET_ROUND[node.round],
              bracketSlot: node.slot,
              homeSourceType: node.home.type,
              homeSourceRef: node.home.ref,
              awaySourceType: node.away.type,
              awaySourceRef: node.away.ref,
              matchId: match.id,
            },
          });
          bmByNode.set(node.id, bm.id);

          const arr = matchesByRound.get(node.round) ?? [];
          arr.push(match.id);
          matchesByRound.set(node.round, arr);
        }

        // Segundo paso: enlazar feedsWinnerTo.
        for (const node of nodes) {
          if (!node.feedsWinnerTo) continue;
          await tx.bracketMatch.update({
            where: { id: bmByNode.get(node.id)! },
            data: {
              feedsWinnerToId: bmByNode.get(node.feedsWinnerTo.nodeId)!,
              feedsWinnerToSlot: node.feedsWinnerTo.side === "home" ? 0 : 1,
            },
          });
        }
      }

      // Agendado: ronda por ronda, en secuencia.
      let roundStart = cupStart;
      let roundOrder = (lastGroupRound?.order ?? 0) + 1;

      for (const roundName of ROUND_ORDER) {
        const matchIds = matchesByRound.get(roundName) ?? [];
        if (matchIds.length === 0) continue;

        const matchRows = await tx.match.findMany({
          where: { id: { in: matchIds } },
          select: { id: true, cupId: true },
        });

        const schedule = scheduleMatches(
          {
            fieldCount: tournament.config!.fieldCount,
            matchDurationMin: tournament.config!.matchDurationMin,
            turnoverMin: tournament.config!.turnoverMin,
            startsAt: roundStart,
          },
          matchRows.map((m, i) => ({
            ref: m.id,
            // No hay equipos definidos aún en rondas > octavos: cada partido es su
            // propia unidad y no hay choque de equipos entre partidos de copa.
            homeTeamId: `h-${m.id}`,
            awayTeamId: `a-${m.id}`,
            unitKey: `${m.cupId}:${i}`,
            order: i,
          })),
        );

        const byTanda = new Map<number, typeof schedule.matches>();
        for (const sm of schedule.matches) {
          const arr = byTanda.get(sm.tanda) ?? [];
          arr.push(sm);
          byTanda.set(sm.tanda, arr);
        }

        for (const [tanda, tandaMatches] of [...byTanda.entries()].sort((a, b) => a[0] - b[0])) {
          const round = await tx.round.create({
            data: {
              tournamentId,
              phase: "CUP",
              label:
                schedule.tandaCount > 1
                  ? `${ROUND_LABEL[roundName]} · Tanda ${tanda + 1}`
                  : ROUND_LABEL[roundName],
              startsAt: schedule.tandaStartTimes[tanda]!,
              durationMin: tournament.config!.matchDurationMin,
              order: roundOrder++,
            },
          });
          for (const sm of tandaMatches) {
            await tx.matchSlot.create({
              data: { roundId: round.id, fieldId: fieldByOrder.get(sm.field)!, matchId: sm.ref },
            });
          }
        }

        roundStart = new Date(roundStart.getTime() + schedule.tandaCount * slotMin * 60_000);
      }

      await tx.tournament.update({ where: { id: tournamentId }, data: { status: "CUPS_PUBLISHED" } });

      await writeAudit(tx, {
        tournamentId,
        userId: ctx.userId,
        action: "cups.generate",
        entity: "Tournament",
        entityId: tournamentId,
        newValue: {
          cups: cupAssignments.map((c) => ({ name: c.cupName, teams: c.seeds.length })),
        },
        ip: ctx.ip ?? null,
      });
    },
    { timeout: 30_000 },
  );

  return {
    cups: cupAssignments.map((c) => ({ name: c.cupName, teams: c.seeds.length })),
    matches: nodes.length * cupAssignments.length,
  };
}

/* ============================================================
 *  Resultado de un partido de copa
 * ============================================================ */

export interface CupResultInput {
  homeScore?: number | null;
  awayScore?: number | null;
  homeShootout?: number | null;
  awayShootout?: number | null;
  walkover?: string | null; // teamId que se presentó
  notes?: string | null;
}

export interface CupResultOutcome {
  ok: true;
  cupFinished: boolean;
}

export async function setCupMatchResult(
  matchId: string,
  input: CupResultInput,
  opts: { confirmCascade?: boolean } = {},
  ctx: Ctx = {},
): Promise<CupResultOutcome> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      bracketMatch: { include: { bracket: { include: { cup: true } } } },
      tournament: { include: { config: true } },
    },
  });
  if (!match || match.phase !== "CUP" || !match.bracketMatch) {
    throw new CupsError("Partido de copa no encontrado.", "MATCH_NOT_FOUND");
  }
  if (!match.homeTeamId || !match.awayTeamId) {
    throw new CupsError("Todavía no están definidos los dos equipos de este cruce.", "TEAMS_NOT_READY");
  }

  const drawResolution = match.tournament!.config!.drawResolution;

  // --- Determinar ganador ---
  let winnerTeamId: string;
  let data: Prisma.MatchUpdateInput;

  if (input.walkover) {
    if (input.walkover !== match.homeTeamId && input.walkover !== match.awayTeamId) {
      throw new CupsError("El equipo del walkover no juega este cruce.", "BAD_INPUT");
    }
    winnerTeamId = input.walkover;
    data = {
      status: "WALKOVER",
      walkoverTeamId: input.walkover,
      winnerTeamId,
      homeScore: null,
      awayScore: null,
      homeShootout: null,
      awayShootout: null,
      notes: input.notes ?? match.notes,
      resultEnteredById: ctx.userId ?? null,
      resultEnteredAt: new Date(),
    };
  } else {
    const hs = input.homeScore;
    const as = input.awayScore;
    if (hs == null || as == null || !Number.isInteger(hs) || !Number.isInteger(as) || hs < 0 || as < 0) {
      throw new CupsError("Cargá goles válidos para ambos equipos.", "BAD_INPUT");
    }
    if (hs !== as) {
      winnerTeamId = hs > as ? match.homeTeamId : match.awayTeamId;
      data = {
        status: "FINISHED",
        homeScore: hs,
        awayScore: as,
        homeShootout: null,
        awayShootout: null,
        winnerTeamId,
        walkoverTeamId: null,
        notes: input.notes ?? match.notes,
        resultEnteredById: ctx.userId ?? null,
        resultEnteredAt: new Date(),
      };
    } else {
      // Empate → definición (shootout por default).
      if (drawResolution === "NONE") {
        throw new CupsError("Este torneo no admite empates sin definición en copa.", "BAD_INPUT");
      }
      const hp = input.homeShootout;
      const ap = input.awayShootout;
      if (hp == null || ap == null || hp === ap) {
        throw new CupsError("Cargá la definición por penales (con un ganador).", "BAD_INPUT");
      }
      winnerTeamId = hp > ap ? match.homeTeamId : match.awayTeamId;
      data = {
        status: "FINISHED",
        homeScore: hs,
        awayScore: as,
        homeShootout: hp,
        awayShootout: ap,
        winnerTeamId,
        walkoverTeamId: null,
        notes: input.notes ?? match.notes,
        resultEnteredById: ctx.userId ?? null,
        resultEnteredAt: new Date(),
      };
    }
  }

  const bm = match.bracketMatch;

  // --- ¿Hace falta confirmar una cascada? ---
  if (bm.feedsWinnerToId && bm.feedsWinnerToSlot != null) {
    const target = await db.bracketMatch.findUnique({
      where: { id: bm.feedsWinnerToId },
      include: { match: true },
    });
    if (target?.match) {
      const side = bm.feedsWinnerToSlot === 0 ? "home" : "away";
      const currentThere = side === "home" ? target.match.homeTeamId : target.match.awayTeamId;
      const downstreamHasResult =
        target.match.status === "FINISHED" || target.match.status === "WALKOVER";
      if (currentThere !== winnerTeamId && downstreamHasResult && !opts.confirmCascade) {
        throw new CupsError(
          "Cambiar este resultado deja sin efecto partidos ya jugados de rondas siguientes. Confirmá para recalcular la llave.",
          "NEEDS_CASCADE_CONFIRM",
        );
      }
    }
  }

  const previous = {
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    winnerTeamId: match.winnerTeamId,
  };

  const cupFinished = await db.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data });

    // Propagación hacia adelante (con reseteo en cascada si hace falta).
    await propagateWinner(tx, bm.id, winnerTeamId);

    // Estado del torneo.
    if (match.tournament!.status === "CUPS_PUBLISHED") {
      await tx.tournament.update({
        where: { id: match.tournamentId },
        data: { status: "CUPS_IN_PROGRESS" },
      });
    }

    // Posiciones finales de la copa si se cerró una final.
    let finished = false;
    if (bm.round === "FINAL") {
      await applyCupFinalPositions(tx, bm.bracketId, match.cupId!, winnerTeamId);
    }

    const openFinals = await tx.match.count({
      where: {
        tournamentId: match.tournamentId,
        phase: "CUP",
        bracketMatch: { round: "FINAL" },
        status: { notIn: ["FINISHED", "WALKOVER"] },
      },
    });
    if (openFinals === 0) {
      await tx.tournament.update({
        where: { id: match.tournamentId },
        data: { status: "FINISHED" },
      });
      finished = true;
      await enqueueNotification(tx, {
        type: "RESULT_POSTED",
        payload: { kind: "tournament_finished", tournamentId: match.tournamentId },
        dedupeKey: `tournament-finished:${match.tournamentId}`,
      });
    }

    await writeAudit(tx, {
      tournamentId: match.tournamentId,
      userId: ctx.userId,
      action: "cup.match.result.set",
      entity: "Match",
      entityId: matchId,
      previousValue: previous,
      newValue: { status: data.status, winnerTeamId, cascade: opts.confirmCascade ?? false },
      ip: ctx.ip ?? null,
    });

    return finished;
  });

  return { ok: true, cupFinished };
}

type Tx = Prisma.TransactionClient;

/**
 * Escribe el ganador en el siguiente cruce. Si el siguiente cruce ya tenía
 * resultado y el equipo que llega cambió, resetea ese cruce y sigue reseteando
 * hacia adelante.
 */
async function propagateWinner(tx: Tx, bracketMatchId: string, winnerTeamId: string): Promise<void> {
  const bm = await tx.bracketMatch.findUnique({ where: { id: bracketMatchId } });
  if (!bm?.feedsWinnerToId || bm.feedsWinnerToSlot == null) return;

  const target = await tx.bracketMatch.findUnique({
    where: { id: bm.feedsWinnerToId },
    include: { match: true },
  });
  if (!target?.match) return;

  const side = bm.feedsWinnerToSlot === 0 ? "home" : "away";
  const currentThere = side === "home" ? target.match.homeTeamId : target.match.awayTeamId;
  if (currentThere === winnerTeamId) return;

  const hadResult = target.match.status === "FINISHED" || target.match.status === "WALKOVER";

  await tx.match.update({
    where: { id: target.match.id },
    data: {
      [side === "home" ? "homeTeamId" : "awayTeamId"]: winnerTeamId,
      ...(hadResult
        ? {
            status: "SCHEDULED",
            homeScore: null,
            awayScore: null,
            homeShootout: null,
            awayShootout: null,
            walkoverTeamId: null,
            winnerTeamId: null,
            resultEnteredAt: null,
          }
        : {}),
    },
  });

  if (hadResult && target.match.winnerTeamId) {
    // El resultado anterior alimentaba hacia adelante: hay que limpiar esa rama.
    await clearDownstream(tx, target.id);
  }
}

async function clearDownstream(tx: Tx, bracketMatchId: string): Promise<void> {
  const bm = await tx.bracketMatch.findUnique({ where: { id: bracketMatchId } });
  if (!bm?.feedsWinnerToId || bm.feedsWinnerToSlot == null) return;
  const target = await tx.bracketMatch.findUnique({
    where: { id: bm.feedsWinnerToId },
    include: { match: true },
  });
  if (!target?.match) return;
  const side = bm.feedsWinnerToSlot === 0 ? "home" : "away";
  const hadResult = target.match.status === "FINISHED" || target.match.status === "WALKOVER";
  await tx.match.update({
    where: { id: target.match.id },
    data: {
      [side === "home" ? "homeTeamId" : "awayTeamId"]: null,
      status: "SCHEDULED",
      homeScore: null,
      awayScore: null,
      homeShootout: null,
      awayShootout: null,
      walkoverTeamId: null,
      winnerTeamId: null,
      resultEnteredAt: null,
    },
  });
  if (hadResult) await clearDownstream(tx, target.id);
}

async function applyCupFinalPositions(
  tx: Tx,
  bracketId: string,
  cupId: string,
  championTeamId: string,
): Promise<void> {
  const finalBm = await tx.bracketMatch.findFirst({
    where: { bracketId, round: "FINAL" },
    include: { match: true },
  });
  if (!finalBm?.match) return;

  const runnerUp =
    finalBm.match.homeTeamId === championTeamId
      ? finalBm.match.awayTeamId
      : finalBm.match.homeTeamId;

  // Reset de posiciones de la copa.
  await tx.team.updateMany({ where: { cupId }, data: { finalPosition: null } });
  await tx.team.update({ where: { id: championTeamId }, data: { finalPosition: 1 } });
  if (runnerUp) await tx.team.update({ where: { id: runnerUp }, data: { finalPosition: 2 } });

  // 3º compartido: perdedores de semifinal.
  const semis = await tx.bracketMatch.findMany({
    where: { bracketId, round: "SEMIS" },
    include: { match: true },
  });
  for (const semi of semis) {
    if (!semi.match?.winnerTeamId) continue;
    const loser =
      semi.match.homeTeamId === semi.match.winnerTeamId
        ? semi.match.awayTeamId
        : semi.match.homeTeamId;
    if (loser) await tx.team.update({ where: { id: loser }, data: { finalPosition: 3 } });
  }
}
