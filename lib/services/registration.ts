import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { countryCode } from "@/lib/countries";
import { writeAudit } from "@/lib/services/audit";
import { enqueueNotification } from "@/lib/services/notification";
import { notifyAdmin } from "@/lib/services/admin-alerts";
import { calculatePrice, formatArs, type PriceQuote } from "@/lib/tournament/pricing";
import { validateRoster, type RosterPlayerInput } from "@/lib/tournament/roster";
import { getActiveTournament } from "@/lib/tournament/queries";
import { OCCUPYING_STATUSES } from "@/lib/tournament/queries";
import type { RegistrationSubmitInput } from "@/lib/validation/registration";

export class RegistrationError extends Error {
  constructor(
    message: string,
    public code:
      | "TOURNAMENT_CLOSED"
      | "TOURNAMENT_FULL"
      | "ROSTER_INVALID"
      | "DUPLICATE_TEAM"
      | "ALREADY_REGISTERED",
    public details?: unknown,
  ) {
    super(message);
    this.name = "RegistrationError";
  }
}

export interface CreateRegistrationResult {
  teamId: string;
  registrationId: string;
  teamSlug: string;
  managerEmail: string;
  quote: PriceQuote;
}

/**
 * Crea el equipo, la inscripción (PENDING_PAYMENT) y los jugadores en una única
 * transacción. El precio se calcula SIEMPRE en el backend y se congela en la
 * inscripción; el frontend nunca lo envía.
 */
export async function createRegistration(
  input: RegistrationSubmitInput,
  ctx: { ip?: string | null } = {},
): Promise<CreateRegistrationResult> {
  const tournament = await getActiveTournament();
  const config = tournament.config!;

  if (tournament.status !== "REGISTRATION_OPEN") {
    throw new RegistrationError("Las inscripciones no están abiertas.", "TOURNAMENT_CLOSED");
  }
  const now = new Date();
  if (config.registrationClosesAt && now > config.registrationClosesAt) {
    throw new RegistrationError("El período de inscripción terminó.", "TOURNAMENT_CLOSED");
  }

  // --- Validación del plantel (motor puro) ---
  const rosterPlayers: RosterPlayerInput[] = input.players.map((p) => ({
    firstName: p.firstName,
    lastName: p.lastName,
    docNumber: p.docNumber,
    birthDate: new Date(`${p.birthDate}T00:00:00Z`),
    gender: p.gender,
    shirtNumber: p.shirtNumber ?? null,
    playsHockey: p.playsHockey,
  }));

  const rosterResult = validateRoster(
    {
      minPlayers: config.minPlayers,
      maxPlayers: config.maxPlayers,
      playersOnField: config.playersOnField,
      maxMenOnField: config.maxMenOnField,
      minPlayerAge: config.minPlayerAge,
    },
    rosterPlayers,
    { referenceDate: tournament.startDate ?? now },
  );

  if (!rosterResult.ok) {
    throw new RegistrationError(
      "El plantel no cumple las reglas de inscripción.",
      "ROSTER_INVALID",
      rosterResult.issues.filter((i) => i.blocking),
    );
  }

  // --- Precio (motor puro) ---
  const quote = calculatePrice(
    {
      basePlayers: config.basePlayers,
      earlyPrice: config.earlyPrice,
      latePrice: config.latePrice,
      extraPlayerPrice: config.extraPlayerPrice,
      priceChangeAt: config.priceChangeAt,
      paymentSurchargeBp: config.paymentSurchargeBp,
    },
    input.players.length,
    now,
  );

  const result = await db.$transaction(async (tx) => {
    // Cupo (chequeo best-effort; la protección real de carrera es al confirmar el pago, Fase 2)
    const occupying = await tx.team.count({
      where: {
        tournamentId: tournament.id,
        registrationStatus: { in: [...OCCUPYING_STATUSES] },
      },
    });
    if (occupying >= config.maxTeams) {
      throw new RegistrationError("Los cupos están completos.", "TOURNAMENT_FULL");
    }

    // Un país, un equipo — torneo formato mundial.
    const taken = await tx.team.findFirst({
      where: { tournamentId: tournament.id, name: input.team.name, registrationStatus: { not: "CANCELLED" } },
    });
    if (taken) {
      throw new RegistrationError(`${input.team.name} ya está inscripto en el torneo.`, "DUPLICATE_TEAM");
    }

    // Responsable: usuario existente o nuevo (sin verificar; se verifica con el magic link)
    const email = input.manager.contactEmail;
    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      user = await tx.user.create({
        data: { email, name: input.manager.contactName, role: "TEAM_MANAGER" },
      });
    }

    // Slug único por torneo
    const baseSlug = slugify(input.team.name);
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
        name: input.team.name,
        slug,
        shortName: countryCode(input.team.name),
        managerUserId: user.id,
        contactName: input.manager.contactName,
        contactEmail: email,
        contactPhone: input.manager.contactPhone,
        registrationStatus: "PENDING_PAYMENT",
        players: {
          create: input.players.map((p) => ({
            tournamentId: tournament.id,
            firstName: p.firstName,
            lastName: p.lastName,
            docType: p.docType,
            docNumber: p.docNumber,
            birthDate: new Date(`${p.birthDate}T00:00:00Z`),
            gender: p.gender,
            shirtNumber: p.shirtNumber ?? null,
            phone: p.phone || null,
            email: p.email || null,
            position: p.position || null,
            dietaryRestriction: p.dietaryRestriction || null,
            attendsParty: p.attendsParty,
            playsHockey: p.playsHockey,
          })),
        },
      },
    });

    const registration = await tx.registration.create({
      data: {
        teamId: team.id,
        tournamentId: tournament.id,
        status: "PENDING_PAYMENT",
        playerCountQuoted: input.players.length,
        priceTier: quote.tier,
        baseAmount: quote.baseAmount,
        extraPlayersAmount: quote.extraPlayersAmount,
        surchargeAmount: quote.surchargeAmount,
        totalAmount: quote.totalAmount,
        quotedAt: now,
      },
    });

    await writeAudit(tx, {
      tournamentId: tournament.id,
      userId: user.id,
      action: "registration.create",
      entity: "Registration",
      entityId: registration.id,
      newValue: {
        teamId: team.id,
        teamName: team.name,
        players: input.players.length,
        totalAmount: quote.totalAmount,
        tier: quote.tier,
      },
      ip: ctx.ip ?? null,
    });

    await enqueueNotification(tx, {
      type: "REGISTRATION_CONFIRMED",
      recipientTeamId: team.id,
      recipientUserId: user.id,
      payload: { teamId: team.id, teamName: team.name },
      dedupeKey: `registration-received:${registration.id}`,
    });

    await notifyAdmin(tx, {
      title: `Nueva inscripción — ${team.name}`,
      lines: [
        `Responsable: ${input.manager.contactName} (${email})`,
        `Jugadores: ${input.players.length}`,
        `Total: ${formatArs(quote.totalAmount)}`,
      ],
      teamId: team.id,
      teamName: team.name,
      dedupeKey: `admin-alert:registration.create:${registration.id}`,
    });

    return { team, registration, email };
  });

  return {
    teamId: result.team.id,
    registrationId: result.registration.id,
    teamSlug: result.team.slug,
    managerEmail: result.email,
    quote,
  };
}
