import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { computeStandings, type MatchInput, type StandingsConfig } from "@/lib/tournament/standings";
import { rankGroup, type TiebreakCriterion } from "@/lib/tournament/tiebreakers";
import type { Prisma } from "@prisma/client";

export class ResultError extends Error {
  constructor(
    message: string,
    public code: "MATCH_NOT_FOUND" | "BAD_INPUT" | "WRONG_PHASE",
  ) {
    super(message);
    this.name = "ResultError";
  }
}

export interface GroupResultInput {
  homeScore?: number | null;
  awayScore?: number | null;
  /** Marca walkover: id del equipo que se presentó, o "NONE" para doble ausencia. */
  walkover?: string | null;
  notes?: string | null;
  homeFairPlayPoints?: number;
  awayFairPlayPoints?: number;
}

function standingsConfigFrom(config: {
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  pointsWalkover: number;
  walkoverScore: string;
}): StandingsConfig {
  return {
    pointsWin: config.pointsWin,
    pointsDraw: config.pointsDraw,
    pointsLoss: config.pointsLoss,
    pointsWalkover: config.pointsWalkover,
    walkoverScore: config.walkoverScore,
  };
}

/**
 * Carga o corrige el resultado de un partido de fase de grupos y recalcula la
 * tabla del grupo. Todo en una transacción con AuditLog.
 */
export async function setGroupMatchResult(
  matchId: string,
  input: GroupResultInput,
  ctx: { userId?: string | null; ip?: string | null } = {},
): Promise<void> {
  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { tournament: { include: { config: true } } },
  });
  if (!match) throw new ResultError("Partido no encontrado.", "MATCH_NOT_FOUND");
  if (match.phase !== "GROUP") throw new ResultError("Este partido no es de fase de grupos.", "WRONG_PHASE");
  if (!match.groupId || !match.homeTeamId || !match.awayTeamId) {
    throw new ResultError("El partido no tiene grupo o equipos asignados.", "BAD_INPUT");
  }
  if (!match.tournament?.config) throw new ResultError("Falta configuración.", "BAD_INPUT");

  const previous = {
    status: match.status,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    walkoverTeamId: match.walkoverTeamId,
  };

  let data: Prisma.MatchUpdateInput;

  if (input.walkover) {
    const woTeamId = input.walkover === "NONE" ? null : input.walkover;
    if (woTeamId && woTeamId !== match.homeTeamId && woTeamId !== match.awayTeamId) {
      throw new ResultError("El equipo del walkover no juega este partido.", "BAD_INPUT");
    }
    data = {
      status: "WALKOVER",
      walkoverTeamId: woTeamId,
      winnerTeamId: woTeamId,
      homeScore: null,
      awayScore: null,
      notes: input.notes ?? match.notes,
      resultEnteredById: ctx.userId ?? null,
      resultEnteredAt: new Date(),
    };
  } else {
    const hs = input.homeScore;
    const as = input.awayScore;
    if (
      hs == null ||
      as == null ||
      !Number.isInteger(hs) ||
      !Number.isInteger(as) ||
      hs < 0 ||
      as < 0
    ) {
      throw new ResultError("Cargá goles válidos (enteros ≥ 0) para ambos equipos.", "BAD_INPUT");
    }
    data = {
      status: "FINISHED",
      homeScore: hs,
      awayScore: as,
      walkoverTeamId: null,
      winnerTeamId: hs > as ? match.homeTeamId : as > hs ? match.awayTeamId : null,
      notes: input.notes ?? match.notes,
      resultEnteredById: ctx.userId ?? null,
      resultEnteredAt: new Date(),
    };
  }

  await db.$transaction(async (tx) => {
    await tx.match.update({ where: { id: matchId }, data });

    // El torneo pasa a "en juego" con el primer resultado de grupos.
    if (match.tournament!.status === "GROUPS_PUBLISHED") {
      await tx.tournament.update({
        where: { id: match.tournamentId },
        data: { status: "GROUPS_IN_PROGRESS" },
      });
    }

    await recomputeGroupStandingsTx(tx, match.groupId!, {
      standingsConfig: standingsConfigFrom(match.tournament!.config!),
      tiebreakers: match.tournament!.config!.tiebreakers as TiebreakCriterion[],
      tournamentId: match.tournamentId,
    });

    await writeAudit(tx, {
      tournamentId: match.tournamentId,
      userId: ctx.userId,
      action: "match.result.set",
      entity: "Match",
      entityId: matchId,
      previousValue: previous,
      newValue: {
        status: data.status,
        homeScore: data.homeScore ?? null,
        awayScore: data.awayScore ?? null,
        walkoverTeamId: data.walkoverTeamId ?? null,
      },
      ip: ctx.ip ?? null,
    });
  });
}

type Tx = Prisma.TransactionClient;

async function recomputeGroupStandingsTx(
  tx: Tx,
  groupId: string,
  opts: {
    standingsConfig: StandingsConfig;
    tiebreakers: TiebreakCriterion[];
    tournamentId: string;
  },
): Promise<void> {
  const group = await tx.group.findUnique({
    where: { id: groupId },
    include: { groupTeams: true },
  });
  if (!group) return;

  const matches = await tx.match.findMany({
    where: { groupId, phase: "GROUP" },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      status: true,
      homeScore: true,
      awayScore: true,
      walkoverTeamId: true,
    },
  });

  const teamIds = group.groupTeams.map((gt) => gt.teamId);
  const matchInputs: MatchInput[] = matches
    .filter((m) => m.homeTeamId && m.awayTeamId)
    .map((m) => ({
      homeTeamId: m.homeTeamId!,
      awayTeamId: m.awayTeamId!,
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      walkoverTeamId: m.walkoverTeamId,
    }));

  const standings = computeStandings(opts.standingsConfig, teamIds, matchInputs);
  const ranked = rankGroup(standings, matchInputs, {
    standingsConfig: opts.standingsConfig,
    criteria: opts.tiebreakers,
    drawSeed: `${opts.tournamentId}:${group.name}`,
  });

  for (const r of ranked) {
    await tx.groupTeam.update({
      where: { groupId_teamId: { groupId, teamId: r.teamId } },
      data: {
        played: r.standing.played,
        won: r.standing.won,
        drawn: r.standing.drawn,
        lost: r.standing.lost,
        goalsFor: r.standing.goalsFor,
        goalsAgainst: r.standing.goalsAgainst,
        goalDiff: r.standing.goalDiff,
        points: r.standing.points,
        fairPlayPoints: r.standing.fairPlayPoints,
        rank: r.rank,
        tiebreakNote: r.tiebreakNote ?? null,
      },
    });
  }
}

/** Recalcula la tabla de un grupo por fuera de una transacción (uso admin/manual). */
export async function recomputeGroupStandings(groupId: string): Promise<void> {
  const group = await db.group.findUnique({
    where: { id: groupId },
    include: { tournament: { include: { config: true } } },
  });
  if (!group?.tournament?.config) return;
  await db.$transaction(async (tx) => {
    await recomputeGroupStandingsTx(tx, groupId, {
      standingsConfig: standingsConfigFrom(group.tournament.config!),
      tiebreakers: group.tournament.config!.tiebreakers as TiebreakCriterion[],
      tournamentId: group.tournamentId,
    });
  });
}
