import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { writeAudit } from "@/lib/services/audit";
import { enqueueNotification } from "@/lib/services/notification";
import { notifyAdmin } from "@/lib/services/admin-alerts";
import { getActiveTournament, OCCUPYING_STATUSES } from "@/lib/tournament/queries";
import { countryCode } from "@/lib/countries";

export class WaitlistError extends Error {
  constructor(
    message: string,
    public code: "DUPLICATE_TEAM",
  ) {
    super(message);
    this.name = "WaitlistError";
  }
}

export interface JoinWaitlistInput {
  /** Nombre del país (torneo formato mundial) — debe salir de lib/countries.ts. */
  teamName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

/** Suma un equipo a la lista de espera (Registration.status = WAITLISTED). */
export async function joinWaitlist(input: JoinWaitlistInput, ctx: { ip?: string | null } = {}) {
  const tournament = await getActiveTournament();

  const taken = await db.team.findFirst({
    where: { tournamentId: tournament.id, name: input.teamName, registrationStatus: { not: "CANCELLED" } },
  });
  if (taken) {
    throw new WaitlistError(`${input.teamName} ya está inscripto en el torneo.`, "DUPLICATE_TEAM");
  }

  return db.$transaction(async (tx) => {
    const email = input.contactEmail.trim().toLowerCase();

    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      user = await tx.user.create({
        data: { email, name: input.contactName, role: "TEAM_MANAGER" },
      });
    }

    const lastPos = await tx.registration.aggregate({
      where: { tournamentId: tournament.id, status: "WAITLISTED" },
      _max: { waitlistPosition: true },
    });
    const position = (lastPos._max.waitlistPosition ?? 0) + 1;

    const baseSlug = slugify(input.teamName);
    let slug = baseSlug;
    for (let i = 2; ; i++) {
      const clash = await tx.team.findUnique({
        where: { tournamentId_slug: { tournamentId: tournament.id, slug } },
      });
      if (!clash) break;
      slug = `${baseSlug}-${i}`;
    }

    const team = await tx.team.create({
      data: {
        tournamentId: tournament.id,
        name: input.teamName,
        slug,
        shortName: countryCode(input.teamName),
        managerUserId: user.id,
        contactName: input.contactName,
        contactEmail: email,
        contactPhone: input.contactPhone,
        registrationStatus: "WAITLISTED",
      },
    });

    const registration = await tx.registration.create({
      data: {
        teamId: team.id,
        tournamentId: tournament.id,
        status: "WAITLISTED",
        waitlistPosition: position,
      },
    });

    await writeAudit(tx, {
      tournamentId: tournament.id,
      userId: user.id,
      action: "waitlist.join",
      entity: "Registration",
      entityId: registration.id,
      newValue: { teamName: team.name, position },
      ip: ctx.ip ?? null,
    });

    await notifyAdmin(tx, {
      title: `Lista de espera — ${team.name}`,
      lines: [`Responsable: ${input.contactName} (${email})`, `Posición: ${position}`],
      teamId: team.id,
      teamName: team.name,
      dedupeKey: `admin-alert:waitlist.join:${registration.id}`,
    });

    return { position };
  });
}

interface Ctx {
  userId?: string | null;
  ip?: string | null;
}

async function freeSlots(tournamentId: string): Promise<number> {
  const t = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: { config: true },
  });
  const occupying = await db.team.count({
    where: { tournamentId, registrationStatus: { in: [...OCCUPYING_STATUSES] } },
  });
  return Math.max(0, (t.config?.maxTeams ?? 0) - occupying);
}

/** Invita a un equipo de la lista de espera: pasa a "pendiente de pago" con una ventana. */
export async function promoteWaitlistEntry(registrationId: string, ctx: Ctx = {}): Promise<void> {
  const registration = await db.registration.findUnique({
    where: { id: registrationId },
    include: { team: true, tournament: { include: { config: true } } },
  });
  if (!registration || registration.status !== "WAITLISTED") {
    throw new Error("La inscripción no está en lista de espera.");
  }
  if ((await freeSlots(registration.tournamentId)) <= 0) {
    throw new Error("No hay cupos libres.");
  }

  const windowH = registration.tournament?.config?.waitlistPaymentWindowHours ?? 48;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowH * 3_600_000);

  await db.$transaction(async (tx) => {
    await tx.registration.update({
      where: { id: registrationId },
      data: {
        status: "PENDING_PAYMENT",
        waitlistPosition: null,
        waitlistInvitedAt: now,
        waitlistExpiresAt: expiresAt,
      },
    });
    await tx.team.update({
      where: { id: registration.teamId },
      data: { registrationStatus: "PENDING_PAYMENT", paymentStatus: "PENDING" },
    });
    await enqueueNotification(tx, {
      type: "WAITLIST_INVITED",
      recipientTeamId: registration.teamId,
      recipientUserId: registration.team.managerUserId,
      payload: { teamId: registration.teamId, expiresAt: expiresAt.toISOString() },
      dedupeKey: `waitlist-invited:${registrationId}:${now.getTime()}`,
    });
    await writeAudit(tx, {
      tournamentId: registration.tournamentId,
      userId: ctx.userId,
      action: "waitlist.promote",
      entity: "Registration",
      entityId: registrationId,
      newValue: { expiresAt: expiresAt.toISOString() },
      ip: ctx.ip ?? null,
    });
    await notifyAdmin(tx, {
      title: `Cupo liberado — invitamos a ${registration.team.name}`,
      lines: [`Tiene hasta ${expiresAt.toLocaleString("es-AR")} para pagar.`],
      teamId: registration.teamId,
      teamName: registration.team.name,
      dedupeKey: `admin-alert:waitlist.promote:${registrationId}:${now.getTime()}`,
    });
  });
}

/**
 * Promoción automática (cron): expira invitaciones vencidas sin pagar y llena
 * los cupos libres con los primeros de la lista de espera.
 */
export async function autoPromoteWaitlist(tournamentId: string): Promise<{
  expired: number;
  promoted: number;
}> {
  const now = new Date();
  let expired = 0;
  let promoted = 0;

  // 1) Expirar invitaciones vencidas → vuelven al final de la lista.
  const stale = await db.registration.findMany({
    where: {
      tournamentId,
      status: "PENDING_PAYMENT",
      waitlistInvitedAt: { not: null },
      waitlistExpiresAt: { lt: now },
    },
    include: { payments: { where: { status: "APPROVED" }, take: 1 }, team: { select: { name: true } } },
  });
  for (const reg of stale) {
    if (reg.payments.length > 0) continue; // pagó justo a tiempo
    const last = await db.registration.aggregate({
      where: { tournamentId, status: "WAITLISTED" },
      _max: { waitlistPosition: true },
    });
    await db.$transaction(async (tx) => {
      await tx.registration.update({
        where: { id: reg.id },
        data: {
          status: "WAITLISTED",
          waitlistPosition: (last._max.waitlistPosition ?? 0) + 1,
          waitlistInvitedAt: null,
          waitlistExpiresAt: null,
        },
      });
      await tx.team.update({
        where: { id: reg.teamId },
        data: { registrationStatus: "WAITLISTED", paymentStatus: "NONE" },
      });
      await writeAudit(tx, {
        tournamentId,
        action: "waitlist.expire",
        entity: "Registration",
        entityId: reg.id,
      });
      await notifyAdmin(tx, {
        title: `Invitación vencida — ${reg.team.name}`,
        lines: ["No pagó a tiempo y volvió al final de la lista de espera."],
        teamId: reg.teamId,
        teamName: reg.team.name,
        dedupeKey: `admin-alert:waitlist.expire:${reg.id}:${now.getTime()}`,
      });
    });
    expired++;
  }

  // 2) Llenar cupos libres.
  let slots = await freeSlots(tournamentId);
  while (slots > 0) {
    const next = await db.registration.findFirst({
      where: { tournamentId, status: "WAITLISTED" },
      orderBy: { waitlistPosition: "asc" },
    });
    if (!next) break;
    await promoteWaitlistEntry(next.id);
    promoted++;
    slots--;
  }

  return { expired, promoted };
}

export interface WaitlistRow {
  registrationId: string;
  teamId: string;
  teamName: string;
  contactName: string;
  contactEmail: string;
  position: number | null;
  status: string;
  invitedAt: Date | null;
  expiresAt: Date | null;
}

export async function getWaitlist(tournamentId: string): Promise<WaitlistRow[]> {
  const regs = await db.registration.findMany({
    where: {
      tournamentId,
      OR: [{ status: "WAITLISTED" }, { waitlistInvitedAt: { not: null } }],
    },
    include: { team: true },
    orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
  });
  return regs.map((r) => ({
    registrationId: r.id,
    teamId: r.teamId,
    teamName: r.team.name,
    contactName: r.team.contactName,
    contactEmail: r.team.contactEmail,
    position: r.waitlistPosition,
    status: r.status,
    invitedAt: r.waitlistInvitedAt,
    expiresAt: r.waitlistExpiresAt,
  }));
}
