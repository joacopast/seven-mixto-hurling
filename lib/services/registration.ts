import "server-only";
import { db } from "@/lib/db";
import { slugify } from "@/lib/slug";
import { countryCode } from "@/lib/countries";
import { writeAudit } from "@/lib/services/audit";
import { enqueueNotification } from "@/lib/services/notification";
import { notifyAdmin } from "@/lib/services/admin-alerts";
import { calculatePrice, quoteForTier, formatArs, type PriceQuote } from "@/lib/tournament/pricing";
import { validateRoster, type RosterPlayerInput } from "@/lib/tournament/roster";
import { getActiveTournament } from "@/lib/tournament/queries";
import { OCCUPYING_STATUSES } from "@/lib/tournament/queries";
import type { RegistrationSubmitInput } from "@/lib/validation/registration";
import type { Prisma } from "@prisma/client";

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

/** Estados en los que lo que debe el equipo depende de lo ya aprobado. */
const BALANCE_DEPENDENT_STATUSES = new Set(["CONFIRMED", "PAYMENT_APPROVED", "DEPOSIT_PAID"]);

/**
 * Recalcula el precio de la inscripción de un equipo según su plantel
 * *actual* — hay que llamarla cada vez que un jugador se agrega o se saca
 * (`adminAddPlayer`/`adminRemovePlayer`), para que `Registration.totalAmount`
 * y `playerCountQuoted` siempre reflejen la cantidad real de jugadores en vez
 * de quedar congelados en la cotización original. Si la inscripción ya tenía
 * tarifa asignada, la mantiene fija (agregar o sacar un jugador no tiene que
 * mover a un equipo de tarifa temprana a tardía por casualidad de la fecha en
 * que se edita el plantel) — recalcula con la tarifa vigente hoy solo la
 * primera vez que se cotiza (equipo cargado a mano por el admin, sin pasar
 * por el wizard). Si el total cambia y el equipo ya estaba pagando
 * (`CONFIRMED`/`PAYMENT_APPROVED`/`DEPOSIT_PAID`), recalcula también el
 * estado según lo que ya tiene aprobado: agregar jugadores puede hacer que un
 * equipo confirmado pase a deber un saldo; sacar jugadores puede hacer que
 * una seña ya cubra el nuevo total.
 */
export async function requoteRegistrationForPlayerCount(
  tx: Prisma.TransactionClient,
  teamId: string,
  ctx: { userId?: string | null; ip?: string | null } = {},
): Promise<void> {
  const team = await tx.team.findUnique({
    where: { id: teamId },
    include: { registration: true, tournament: { include: { config: true } } },
  });
  const registration = team?.registration;
  const config = team?.tournament.config;
  if (!team || !registration || !config) return;

  const playerCount = await tx.player.count({ where: { teamId } });
  const now = new Date();
  const pricingConfig = {
    basePlayers: config.basePlayers,
    earlyPrice: config.earlyPrice,
    latePrice: config.latePrice,
    extraPlayerPrice: config.extraPlayerPrice,
    priceChangeAt: config.priceChangeAt,
    paymentSurchargeBp: config.paymentSurchargeBp,
  };

  const quote = registration.quotedAt
    ? quoteForTier(pricingConfig, registration.priceTier, playerCount)
    : calculatePrice(pricingConfig, playerCount, now);

  if (quote.totalAmount === registration.totalAmount && playerCount === registration.playerCountQuoted) {
    return;
  }

  await tx.registration.update({
    where: { id: registration.id },
    data: {
      playerCountQuoted: playerCount,
      priceTier: quote.tier,
      baseAmount: quote.baseAmount,
      extraPlayersAmount: quote.extraPlayersAmount,
      surchargeAmount: quote.surchargeAmount,
      totalAmount: quote.totalAmount,
      quotedAt: registration.quotedAt ?? now,
    },
  });
  await writeAudit(tx, {
    tournamentId: team.tournamentId,
    userId: ctx.userId,
    action: "registration.requote",
    entity: "Registration",
    entityId: registration.id,
    previousValue: { playerCount: registration.playerCountQuoted, totalAmount: registration.totalAmount },
    newValue: { playerCount, totalAmount: quote.totalAmount },
    ip: ctx.ip ?? null,
  });

  if (!BALANCE_DEPENDENT_STATUSES.has(registration.status)) return;

  const paidAgg = await tx.payment.aggregate({
    where: { registrationId: registration.id, status: "APPROVED" },
    _sum: { amount: true },
  });
  const paid = paidAgg._sum.amount ?? 0;
  // Si no hay ningún pago aprobado detrás, no es un desbalance real de plata
  // — es un equipo que el admin marcó CONFIRMED a mano (invitado, de cortesía)
  // sin pasar por un pago; no lo tocamos. Solo reconciliamos cuando sí hay
  // plata aprobada de por medio.
  if (paid <= 0) return;
  const newStatus = paid >= quote.totalAmount ? "CONFIRMED" : "DEPOSIT_PAID";
  if (newStatus === registration.status) return;

  await tx.registration.update({
    where: { id: registration.id },
    data: {
      status: newStatus,
      confirmedAt: newStatus === "CONFIRMED" ? (registration.confirmedAt ?? now) : null,
    },
  });
  await tx.team.update({
    where: { id: teamId },
    data: {
      registrationStatus: newStatus,
      paymentStatus: newStatus === "CONFIRMED" ? "APPROVED" : "PENDING",
      registeredAt: newStatus === "CONFIRMED" ? (team.registeredAt ?? now) : team.registeredAt,
    },
  });
  await writeAudit(tx, {
    tournamentId: team.tournamentId,
    userId: ctx.userId,
    action: "registration.requote.status",
    entity: "Registration",
    entityId: registration.id,
    previousValue: { status: registration.status, paid },
    newValue: { status: newStatus, paid, totalAmount: quote.totalAmount },
    ip: ctx.ip ?? null,
  });
  await notifyAdmin(tx, {
    title: `Cambió lo que debe ${team.name} al editar el plantel`,
    lines: [
      `Jugadores: ${registration.playerCountQuoted} → ${playerCount}`,
      `Total: ${formatArs(registration.totalAmount)} → ${formatArs(quote.totalAmount)}`,
      `Estado: ${registration.status} → ${newStatus}`,
    ],
    teamId,
    teamName: team.name,
    dedupeKey: `admin-alert:registration.requote.status:${crypto.randomUUID()}`,
  });
}
