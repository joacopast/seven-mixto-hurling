import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { writeAudit } from "@/lib/services/audit";
import { getActiveTournament } from "@/lib/tournament/queries";

export interface JoinWaitlistInput {
  teamName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

/** Suma un equipo a la lista de espera (Registration.status = WAITLISTED). */
export async function joinWaitlist(input: JoinWaitlistInput, ctx: { ip?: string | null } = {}) {
  const tournament = await getActiveTournament();

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

    return { position };
  });
}
