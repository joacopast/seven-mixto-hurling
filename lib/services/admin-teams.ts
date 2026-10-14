import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { writeAudit } from "@/lib/services/audit";
import { normalizeDoc } from "@/lib/validation/registration";
import { countryCode } from "@/lib/countries";
import type { Prisma, RegistrationStatus } from "@prisma/client";

export class AdminTeamError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "HAS_MATCHES" | "DUP_DOC" | "DUP_COUNTRY" | "BAD_INPUT",
  ) {
    super(message);
    this.name = "AdminTeamError";
  }
}

interface Ctx {
  userId?: string | null;
  ip?: string | null;
}

async function uniqueSlug(tx: Prisma.TransactionClient, tournamentId: string, name: string) {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const clash = await tx.team.findUnique({
      where: { tournamentId_slug: { tournamentId, slug } },
    });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
}

export interface AdminCreateTeamInput {
  tournamentId: string;
  /** Nombre del país (torneo formato mundial) — debe salir de lib/countries.ts. */
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  registrationStatus: RegistrationStatus;
  adminNotes?: string;
}

export async function adminCreateTeam(input: AdminCreateTeamInput, ctx: Ctx = {}) {
  const taken = await db.team.findFirst({
    where: {
      tournamentId: input.tournamentId,
      name: input.name,
      registrationStatus: { not: "CANCELLED" },
    },
  });
  if (taken) {
    throw new AdminTeamError(`${input.name} ya está inscripto en el torneo.`, "DUP_COUNTRY");
  }

  return db.$transaction(async (tx) => {
    const email = input.contactEmail.trim().toLowerCase();
    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      user = await tx.user.create({
        data: { email, name: input.contactName, role: "TEAM_MANAGER" },
      });
    }

    const slug = await uniqueSlug(tx, input.tournamentId, input.name);
    const isConfirmed = ["CONFIRMED", "PAYMENT_APPROVED"].includes(input.registrationStatus);

    const team = await tx.team.create({
      data: {
        tournamentId: input.tournamentId,
        name: input.name,
        slug,
        shortName: countryCode(input.name),
        managerUserId: user.id,
        contactName: input.contactName,
        contactEmail: email,
        contactPhone: input.contactPhone,
        registrationStatus: input.registrationStatus,
        paymentStatus: isConfirmed ? "APPROVED" : "NONE",
        registeredAt: isConfirmed ? new Date() : null,
        adminNotes: input.adminNotes || null,
        registration: {
          create: {
            tournamentId: input.tournamentId,
            status: input.registrationStatus,
            confirmedAt: isConfirmed ? new Date() : null,
          },
        },
      },
    });

    await writeAudit(tx, {
      tournamentId: input.tournamentId,
      userId: ctx.userId,
      action: "team.admin.create",
      entity: "Team",
      entityId: team.id,
      newValue: { name: team.name, status: input.registrationStatus },
      ip: ctx.ip ?? null,
    });

    return team;
  });
}

export interface AdminUpdateTeamInput {
  /** Nombre del país (torneo formato mundial) — debe salir de lib/countries.ts. */
  name?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  seed?: number | null;
  adminNotes?: string | null;
}

export async function adminUpdateTeam(teamId: string, input: AdminUpdateTeamInput, ctx: Ctx = {}) {
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) throw new AdminTeamError("Equipo no encontrado.", "NOT_FOUND");

  if (input.name !== undefined && input.name !== team.name) {
    const taken = await db.team.findFirst({
      where: {
        tournamentId: team.tournamentId,
        name: input.name,
        registrationStatus: { not: "CANCELLED" },
        NOT: { id: teamId },
      },
    });
    if (taken) {
      throw new AdminTeamError(`${input.name} ya está inscripto en el torneo.`, "DUP_COUNTRY");
    }
  }

  const data: Prisma.TeamUpdateInput = {};
  const before: Record<string, string | number | null> = {};
  const after: Record<string, string | number | null> = {};

  const track = <K extends keyof AdminUpdateTeamInput>(key: K, current: unknown) => {
    if (input[key] === undefined) return;
    before[key as string] = (current ?? null) as string | number | null;
    after[key as string] = (input[key] ?? null) as string | number | null;
  };

  if (input.name !== undefined) {
    data.name = input.name;
    data.shortName = countryCode(input.name);
    track("name", team.name);
  }
  if (input.contactName !== undefined) {
    data.contactName = input.contactName;
    track("contactName", team.contactName);
  }
  if (input.contactEmail !== undefined) {
    data.contactEmail = input.contactEmail.trim().toLowerCase();
    track("contactEmail", team.contactEmail);
  }
  if (input.contactPhone !== undefined) {
    data.contactPhone = input.contactPhone;
    track("contactPhone", team.contactPhone);
  }
  if (input.seed !== undefined) {
    data.seed = input.seed;
    track("seed", team.seed);
  }
  if (input.adminNotes !== undefined) {
    data.adminNotes = input.adminNotes || null;
    track("adminNotes", team.adminNotes);
  }

  if (Object.keys(data).length === 0) return;

  await db.$transaction(async (tx) => {
    await tx.team.update({ where: { id: teamId }, data });
    await writeAudit(tx, {
      tournamentId: team.tournamentId,
      userId: ctx.userId,
      action: "team.admin.update",
      entity: "Team",
      entityId: teamId,
      previousValue: before,
      newValue: after,
      ip: ctx.ip ?? null,
    });
  });
}

export interface AdminPlayerInput {
  firstName: string;
  lastName: string;
  docType: "DNI" | "PASSPORT";
  docNumber: string;
  birthDate: string; // yyyy-mm-dd
  gender: "M" | "F" | "X";
  /** false = acompaña al equipo pero no juega. Default true. */
  isPlayer?: boolean;
  shirtNumber?: number | null;
  phone?: string;
  email?: string;
  position?: string;
  dietaryRestriction?: string;
  attendsParty?: boolean;
}

export async function adminAddPlayer(teamId: string, input: AdminPlayerInput, ctx: Ctx = {}) {
  const team = await db.team.findUnique({ where: { id: teamId } });
  if (!team) throw new AdminTeamError("Equipo no encontrado.", "NOT_FOUND");

  const doc = normalizeDoc(input.docNumber);
  const dup = await db.player.findFirst({ where: { teamId, docNumber: doc } });
  if (dup) throw new AdminTeamError("Ese documento ya está en el plantel.", "DUP_DOC");

  await db.$transaction(async (tx) => {
    const player = await tx.player.create({
      data: {
        teamId,
        tournamentId: team.tournamentId,
        firstName: input.firstName,
        lastName: input.lastName,
        docType: input.docType,
        docNumber: doc,
        birthDate: new Date(`${input.birthDate}T00:00:00Z`),
        gender: input.gender,
        isPlayer: input.isPlayer ?? true,
        shirtNumber: input.shirtNumber ?? null,
        phone: input.phone || null,
        email: input.email || null,
        position: input.position || null,
        dietaryRestriction: input.dietaryRestriction || null,
        attendsParty: input.attendsParty ?? true,
      },
    });
    await writeAudit(tx, {
      tournamentId: team.tournamentId,
      userId: ctx.userId,
      action: "player.admin.add",
      entity: "Player",
      entityId: player.id,
      newValue: { teamId, name: `${input.firstName} ${input.lastName}`, doc },
      ip: ctx.ip ?? null,
    });
  });
}

/**
 * Edita los datos de un jugador ya cargado (nombre, documento, fecha de
 * nacimiento, etc.) — no agrega ni saca jugadores del plantel, así que no
 * toca el precio de la inscripción. La usan tanto el admin como el portal
 * del equipo (`lib/services/roster-self.ts` agrega ahí el chequeo de
 * propiedad + `rosterLockAt` para el caso del responsable del equipo).
 */
export async function updatePlayer(playerId: string, input: AdminPlayerInput, ctx: Ctx = {}) {
  const player = await db.player.findUnique({ where: { id: playerId } });
  if (!player) throw new AdminTeamError("Jugador no encontrado.", "NOT_FOUND");

  const doc = normalizeDoc(input.docNumber);
  if (doc !== player.docNumber) {
    const dup = await db.player.findFirst({
      where: { teamId: player.teamId, docNumber: doc, NOT: { id: playerId } },
    });
    if (dup) throw new AdminTeamError("Ese documento ya está en el plantel.", "DUP_DOC");
  }

  const birthDate = new Date(`${input.birthDate}T00:00:00Z`);

  const data: Prisma.PlayerUpdateInput = {
    firstName: input.firstName,
    lastName: input.lastName,
    docType: input.docType,
    docNumber: doc,
    birthDate,
    gender: input.gender,
    isPlayer: input.isPlayer ?? true,
    shirtNumber: input.shirtNumber ?? null,
    phone: input.phone || null,
    email: input.email || null,
    position: input.position || null,
    dietaryRestriction: input.dietaryRestriction || null,
    attendsParty: input.attendsParty ?? true,
  };

  const before = {
    firstName: player.firstName,
    lastName: player.lastName,
    docType: player.docType,
    docNumber: player.docNumber,
    birthDate: player.birthDate.toISOString().slice(0, 10),
    gender: player.gender,
  };
  const after = {
    firstName: input.firstName,
    lastName: input.lastName,
    docType: input.docType,
    docNumber: doc,
    birthDate: input.birthDate,
    gender: input.gender,
  };

  await db.$transaction(async (tx) => {
    await tx.player.update({ where: { id: playerId }, data });
    await writeAudit(tx, {
      tournamentId: player.tournamentId,
      userId: ctx.userId,
      action: "player.update",
      entity: "Player",
      entityId: playerId,
      previousValue: before,
      newValue: after,
      ip: ctx.ip ?? null,
    });
  });
}

export async function adminRemovePlayer(playerId: string, ctx: Ctx = {}) {
  const player = await db.player.findUnique({ where: { id: playerId }, include: { team: true } });
  if (!player) throw new AdminTeamError("Jugador no encontrado.", "NOT_FOUND");

  await db.$transaction(async (tx) => {
    await tx.player.delete({ where: { id: playerId } });
    await writeAudit(tx, {
      tournamentId: player.tournamentId,
      userId: ctx.userId,
      action: "player.admin.remove",
      entity: "Player",
      entityId: playerId,
      previousValue: {
        teamId: player.teamId,
        name: `${player.firstName} ${player.lastName}`,
        doc: player.docNumber,
      },
      ip: ctx.ip ?? null,
    });
  });
}

export async function adminDeleteTeam(teamId: string, ctx: Ctx = {}) {
  const team = await db.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { homeMatches: true, awayMatches: true } } },
  });
  if (!team) throw new AdminTeamError("Equipo no encontrado.", "NOT_FOUND");
  if (team._count.homeMatches + team._count.awayMatches > 0) {
    throw new AdminTeamError(
      "El equipo tiene partidos asignados. Cancelalo en vez de eliminarlo.",
      "HAS_MATCHES",
    );
  }

  await db.$transaction(async (tx) => {
    await writeAudit(tx, {
      tournamentId: team.tournamentId,
      userId: ctx.userId,
      action: "team.admin.delete",
      entity: "Team",
      entityId: teamId,
      previousValue: { name: team.name, status: team.registrationStatus },
      ip: ctx.ip ?? null,
    });
    await tx.team.delete({ where: { id: teamId } });
  });
}
