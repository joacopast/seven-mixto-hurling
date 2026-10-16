import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { enqueueNotification } from "@/lib/services/notification";
import { CONFIRMED_STATUSES } from "@/lib/tournament/queries";
import { generateGroupFixture } from "@/lib/tournament/group-fixture";
import { scheduleMatches, type SchedulableMatch } from "@/lib/tournament/scheduler";
import type { Prisma } from "@prisma/client";

export class GroupsError extends Error {
  constructor(
    message: string,
    public code:
      | "WRONG_STATUS"
      | "TEAM_NOT_CONFIRMED"
      | "BAD_ASSIGNMENT"
      | "HAS_RESULTS"
      | "NO_GROUPS",
  ) {
    super(message);
    this.name = "GroupsError";
  }
}

const GROUP_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Estados del torneo en los que todavía se puede rearmar grupos y fixture. */
const EDITABLE_STATUSES = ["REGISTRATION_CLOSED", "GROUPS_PUBLISHED"] as const;

interface Ctx {
  userId?: string | null;
  ip?: string | null;
}

export interface ConfirmedTeamForDraw {
  id: string;
  name: string;
  seed: number | null;
  groupId: string | null;
  /** Cantidad de jugadores reales (playsHockey=true) — no cuenta a los que no juegan. */
  playerCount: number;
}

export async function getConfirmedTeams(tournamentId: string): Promise<ConfirmedTeamForDraw[]> {
  const teams = await db.team.findMany({
    where: { tournamentId, registrationStatus: { in: [...CONFIRMED_STATUSES] } },
    orderBy: [{ seed: { sort: "asc", nulls: "last" } }, { registeredAt: "asc" }],
    select: {
      id: true,
      name: true,
      seed: true,
      groupId: true,
      _count: { select: { players: { where: { playsHockey: true } } } },
    },
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    seed: t.seed,
    groupId: t.groupId,
    playerCount: t._count.players,
  }));
}

/**
 * Reparto automático de equipos confirmados en `groupCount` grupos, en
 * serpiente (0,1,…,G-1,G-1,…,1,0,…) para que cada grupo quede parejo.
 *
 * - Si TODOS los equipos tienen `seed` manual (ranking cargado por el admin),
 *   se siembra por ese seed — la decisión del admin siempre gana.
 * - Si no, se siembra por cantidad de JUGADORES reales (de más a menos), no
 *   por el tamaño total del plantel: así no quedan grupos con puros equipos
 *   "cortos" de jugadores contra grupos con puros equipos "grandes". Los
 *   empates en cantidad de jugadores se desempatan con un shuffle
 *   determinista por `drawSeed`.
 */
export function buildAutoAssignment(
  teams: { id: string; seed: number | null; playerCount: number }[],
  groupCount: number,
  drawSeed: string,
): string[][] {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  const allSeeded = teams.length > 0 && teams.every((t) => t.seed != null);

  // PRNG determinista (para desempatar cantidades iguales de jugadores, o
  // como criterio único si tampoco hay playerCount para diferenciar).
  let s = 0;
  for (const c of drawSeed) s = (Math.imul(s, 31) + c.charCodeAt(0)) >>> 0;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  let ordered: string[];
  if (allSeeded) {
    ordered = [...teams].sort((a, b) => a.seed! - b.seed!).map((t) => t.id);
  } else {
    const withTieBreak = teams.map((t) => ({ ...t, tie: rand() }));
    ordered = withTieBreak
      .sort((a, b) => b.playerCount - a.playerCount || a.tie - b.tie)
      .map((t) => t.id);
  }

  // Serpiente: 0,1,..,G-1,G-1,..,1,0,0,1,...
  let dir = 1;
  let g = 0;
  for (const teamId of ordered) {
    groups[g]!.push(teamId);
    if (dir === 1 && g === groupCount - 1) dir = -1;
    else if (dir === -1 && g === 0) dir = 1;
    else g += dir;
  }
  return groups;
}

/**
 * Persiste la asignación de equipos a grupos. `assignment[i]` son los teamIds
 * del grupo i (nombre A, B, C…). Reejecutable mientras no haya resultados.
 */
export async function saveGroupAssignment(
  tournamentId: string,
  assignment: string[][],
  ctx: Ctx = {},
): Promise<void> {
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { config: true },
  });
  if (!tournament) throw new GroupsError("Torneo no encontrado.", "WRONG_STATUS");
  if (!EDITABLE_STATUSES.includes(tournament.status as (typeof EDITABLE_STATUSES)[number])) {
    throw new GroupsError(
      "Solo se pueden armar grupos con la inscripción cerrada y antes de que empiece el torneo.",
      "WRONG_STATUS",
    );
  }

  const anyResult = await db.match.count({
    where: { tournamentId, phase: "GROUP", status: { in: ["FINISHED", "WALKOVER"] } },
  });
  if (anyResult > 0) {
    throw new GroupsError("Ya hay resultados cargados: no se puede rearmar grupos.", "HAS_RESULTS");
  }

  const allTeamIds = assignment.flat();
  if (new Set(allTeamIds).size !== allTeamIds.length) {
    throw new GroupsError("Un equipo aparece en más de un grupo.", "BAD_ASSIGNMENT");
  }
  const confirmed = await getConfirmedTeams(tournamentId);
  const confirmedIds = new Set(confirmed.map((t) => t.id));
  for (const id of allTeamIds) {
    if (!confirmedIds.has(id)) {
      throw new GroupsError("Hay equipos sin inscripción confirmada en la asignación.", "TEAM_NOT_CONFIRMED");
    }
  }

  await db.$transaction(async (tx) => {
    // Limpiar estructura previa de grupos (no hay resultados).
    await tx.match.deleteMany({ where: { tournamentId, phase: "GROUP" } });
    await tx.round.deleteMany({ where: { tournamentId, phase: "GROUP" } });
    await tx.groupTeam.deleteMany({ where: { group: { tournamentId } } });
    await tx.team.updateMany({ where: { tournamentId }, data: { groupId: null } });
    await tx.group.deleteMany({ where: { tournamentId } });

    for (let i = 0; i < assignment.length; i++) {
      const teamIds = assignment[i]!;
      if (teamIds.length === 0) continue;
      const group = await tx.group.create({
        data: { tournamentId, name: GROUP_NAMES[i] ?? `G${i + 1}`, order: i + 1 },
      });
      await tx.team.updateMany({ where: { id: { in: teamIds } }, data: { groupId: group.id } });
      await tx.groupTeam.createMany({
        data: teamIds.map((teamId) => ({ groupId: group.id, teamId })),
      });
    }

    await writeAudit(tx, {
      tournamentId,
      userId: ctx.userId,
      action: "groups.assign",
      entity: "Tournament",
      entityId: tournamentId,
      newValue: { groups: assignment.map((g, i) => ({ name: GROUP_NAMES[i], teams: g.length })) },
      ip: ctx.ip ?? null,
    });
  });
}

/** Genera el fixture de la fase de grupos (rounds, slots, matches). */
export async function generateGroupPhaseFixture(tournamentId: string, ctx: Ctx = {}): Promise<{
  matches: number;
  tandas: number;
}> {
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      config: true,
      groups: { include: { groupTeams: true }, orderBy: { order: "asc" } },
      fields: { orderBy: { order: "asc" } },
    },
  });
  if (!tournament?.config) throw new GroupsError("Falta configuración del torneo.", "WRONG_STATUS");
  if (!EDITABLE_STATUSES.includes(tournament.status as (typeof EDITABLE_STATUSES)[number])) {
    throw new GroupsError("El fixture solo se genera antes de que empiece el torneo.", "WRONG_STATUS");
  }
  if (tournament.groups.length === 0) throw new GroupsError("Primero armá los grupos.", "NO_GROUPS");

  const anyResult = await db.match.count({
    where: { tournamentId, phase: "GROUP", status: { in: ["FINISHED", "WALKOVER"] } },
  });
  if (anyResult > 0) throw new GroupsError("Ya hay resultados: no se regenera el fixture.", "HAS_RESULTS");

  const fixture = generateGroupFixture(
    tournament.groups.map((g) => ({
      groupId: g.id,
      groupName: g.name,
      teamIds: g.groupTeams.map((gt) => gt.teamId),
    })),
  );

  const schedulable: SchedulableMatch[] = fixture.map((m, i) => ({
    ref: String(i),
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    unitKey: `${m.groupId}:${m.groupRound}`,
    order: m.groupRound,
  }));

  const startsAt = tournament.startDate ?? new Date();
  const schedule = scheduleMatches(
    {
      fieldCount: tournament.config.fieldCount,
      matchDurationMin: tournament.config.matchDurationMin,
      turnoverMin: tournament.config.turnoverMin,
      startsAt,
      waterBreak: {
        everyTandas: tournament.config.waterBreakEveryMatches,
        minutes: tournament.config.waterBreakMinutes,
      },
    },
    schedulable,
  );

  await db.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId, phase: "GROUP" } });
    await tx.round.deleteMany({ where: { tournamentId, phase: "GROUP" } });

    // Canchas: crear si faltan.
    let fields = tournament.fields;
    if (fields.length < tournament.config!.fieldCount) {
      await tx.field.deleteMany({ where: { tournamentId } });
      await tx.field.createMany({
        data: Array.from({ length: tournament.config!.fieldCount }, (_, i) => ({
          tournamentId,
          name: `Cancha ${i + 1}`,
          order: i + 1,
        })),
      });
      fields = await tx.field.findMany({ where: { tournamentId }, orderBy: { order: "asc" } });
    }
    const fieldByOrder = new Map(fields.map((f) => [f.order, f.id]));

    const byTanda = new Map<number, typeof schedule.matches>();
    for (const m of schedule.matches) {
      const arr = byTanda.get(m.tanda) ?? [];
      arr.push(m);
      byTanda.set(m.tanda, arr);
    }

    const fixtureByRef = new Map(fixture.map((f, i) => [String(i), f]));

    for (const [tanda, tandaMatches] of [...byTanda.entries()].sort((a, b) => a[0] - b[0])) {
      const startsAtTanda = schedule.tandaStartTimes[tanda]!;
      const round = await tx.round.create({
        data: {
          tournamentId,
          phase: "GROUP",
          label: `Tanda ${tanda + 1}`,
          startsAt: startsAtTanda,
          durationMin: tournament.config!.matchDurationMin,
          order: tanda + 1,
        },
      });

      for (const sm of tandaMatches) {
        const info = fixtureByRef.get(sm.ref)!;
        const match = await tx.match.create({
          data: {
            tournamentId,
            phase: "GROUP",
            groupId: info.groupId,
            homeTeamId: sm.homeTeamId,
            awayTeamId: sm.awayTeamId,
            status: "SCHEDULED",
          },
        });
        await tx.matchSlot.create({
          data: {
            roundId: round.id,
            fieldId: fieldByOrder.get(sm.field)!,
            matchId: match.id,
          },
        });
      }
    }

    await writeAudit(tx, {
      tournamentId,
      userId: ctx.userId,
      action: "groups.fixture.generate",
      entity: "Tournament",
      entityId: tournamentId,
      newValue: { matches: fixture.length, tandas: schedule.tandaCount },
      ip: ctx.ip ?? null,
    });
  });

  return { matches: fixture.length, tandas: schedule.tandaCount };
}

/** Encola el aviso de "fixture publicado" para todos los equipos confirmados. */
export async function notifyFixturePublished(tournamentId: string): Promise<number> {
  const teams = await db.team.findMany({
    where: { tournamentId, registrationStatus: { in: [...CONFIRMED_STATUSES] } },
    select: { id: true, name: true, managerUserId: true },
  });
  await db.$transaction(async (tx) => {
    for (const team of teams) {
      await enqueueNotification(tx, {
        type: "FIXTURE_PUBLISHED",
        recipientTeamId: team.id,
        recipientUserId: team.managerUserId,
        payload: { teamId: team.id, teamName: team.name },
        dedupeKey: `fixture-published:${tournamentId}:${team.id}`,
      });
    }
  });
  return teams.length;
}

export async function setTournamentStatus(
  tournamentId: string,
  status: Prisma.TournamentUpdateInput["status"],
  ctx: Ctx = {},
): Promise<void> {
  const current = await db.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } });
  await db.$transaction(async (tx) => {
    await tx.tournament.update({ where: { id: tournamentId }, data: { status } });
    await writeAudit(tx, {
      tournamentId,
      userId: ctx.userId,
      action: "tournament.status",
      entity: "Tournament",
      entityId: tournamentId,
      previousValue: { status: current?.status },
      newValue: { status },
      ip: ctx.ip ?? null,
    });
  });
}
