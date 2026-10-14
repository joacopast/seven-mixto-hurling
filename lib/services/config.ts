import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import type { ConfigFormInput } from "@/lib/validation/config";

export class ConfigError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "LOCKED",
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Actualiza la configuración del torneo. Algunos campos estructurales quedan
 * bloqueados una vez que hay grupos o partidos creados, para no dejar el motor
 * en un estado inconsistente.
 */
export async function updateTournamentConfig(
  tournamentId: string,
  input: ConfigFormInput,
  ctx: { userId?: string | null; ip?: string | null } = {},
): Promise<{ warnings: string[] }> {
  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { config: true },
  });
  if (!tournament?.config) throw new ConfigError("Torneo no encontrado.", "NOT_FOUND");

  const [groupCount, matchCount] = await Promise.all([
    db.group.count({ where: { tournamentId } }),
    db.match.count({ where: { tournamentId } }),
  ]);
  const structureLocked = groupCount > 0 || matchCount > 0;

  const warnings: string[] = [];

  if (
    structureLocked &&
    (input.maxTeams !== tournament.config.maxTeams ||
      input.groupCount !== tournament.config.groupCount ||
      input.groupSize !== tournament.config.groupSize)
  ) {
    throw new ConfigError(
      "No se pueden cambiar equipos/grupos con la estructura del torneo ya creada. Borrá grupos y fixture primero.",
      "LOCKED",
    );
  }

  if (input.groupCount * input.groupSize < input.maxTeams) {
    warnings.push(
      `Con ${input.groupCount} grupos de ${input.groupSize} entran ${input.groupCount * input.groupSize} equipos, menos que el máximo (${input.maxTeams}).`,
    );
  }
  if (input.maxMenOnField > input.playersOnField) {
    warnings.push("El máximo de hombres en cancha supera la cantidad de jugadores en cancha.");
  }
  if (input.minPlayers > input.maxPlayers) {
    warnings.push("El mínimo de jugadores del plantel es mayor que el máximo.");
  }
  if (input.paymentMethod === "MANUAL_TRANSFER" && (!input.bankAlias?.trim() && !input.bankCbu?.trim())) {
    warnings.push("No cargaste alias ni CBU: los equipos no van a saber a dónde transferir.");
  }
  if (input.paymentMethod === "MANUAL_TRANSFER" && !input.whatsappPhone?.trim()) {
    warnings.push("No cargaste el WhatsApp de contacto para recibir comprobantes.");
  }
  if (input.paymentMethod === "MERCADOPAGO") {
    warnings.push("Mercado Pago cobra comisión por cada cobro; confirmá que es lo que querés usar.");
  }

  const cupNames = input.cupNames
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  let faq: unknown = [];
  if (input.faqJson?.trim()) {
    try {
      const parsed = JSON.parse(input.faqJson);
      if (Array.isArray(parsed)) faq = parsed;
      else warnings.push("El FAQ debe ser una lista JSON; se ignoró.");
    } catch {
      warnings.push("El FAQ no es JSON válido; se ignoró.");
      faq = tournament.config.faq ?? [];
    }
  }

  const inclusions = (input.inclusionsList ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const before = tournament.config;

  await db.$transaction(async (tx) => {
    await tx.tournament.update({
      where: { id: tournamentId },
      data: {
        name: input.name,
        edition: input.edition,
        venueName: input.venueName || null,
        startDate: input.startDate,
        endDate: input.endDate,
      },
    });

    await tx.tournamentConfig.update({
      where: { tournamentId },
      data: {
        maxTeams: input.maxTeams,
        groupCount: input.groupCount,
        groupSize: input.groupSize,
        cupNames,
        cupSize: input.groupCount,
        cupAssignmentStrategy: input.cupAssignmentStrategy,
        thirdPlaceMatch: input.thirdPlaceMatch,

        matchDurationMin: input.matchDurationMin,
        fieldCount: input.fieldCount,
        turnoverMin: input.turnoverMin,
        drawResolution: input.drawResolution,

        pointsWin: input.pointsWin,
        pointsDraw: input.pointsDraw,
        pointsLoss: input.pointsLoss,
        pointsWalkover: input.pointsWalkover,
        walkoverScore: input.walkoverScore.replace(/\s/g, ""),
        tiebreakers: input.tiebreakers,

        minPlayers: input.minPlayers,
        maxPlayers: input.maxPlayers,
        playersOnField: input.playersOnField,
        maxMenOnField: input.maxMenOnField,
        minPlayerAge: input.minPlayerAge,

        basePlayers: input.basePlayers,
        earlyPrice: input.earlyPrice,
        latePrice: input.latePrice,
        extraPlayerPrice: input.extraPlayerPrice,
        priceChangeAt: input.priceChangeAt,
        paymentSurchargeBp: Math.round(input.paymentSurchargePct * 100),

        paymentMethod: input.paymentMethod,
        bankHolderName: input.bankHolderName || null,
        bankCuit: input.bankCuit || null,
        bankName: input.bankName || null,
        bankAlias: input.bankAlias || null,
        bankCbu: input.bankCbu || null,
        whatsappPhone: input.whatsappPhone || null,
        whatsappMessageTemplate: input.whatsappMessageTemplate || undefined,

        registrationOpensAt: input.registrationOpensAt,
        registrationClosesAt: input.registrationClosesAt,
        rosterLockAt: input.rosterLockAt,
        teamEditLockAt: input.teamEditLockAt,
        waitlistPaymentWindowHours: input.waitlistPaymentWindowHours,

        rulesMarkdown: input.rulesMarkdown ?? "",
        inclusionsList: inclusions,
        faq: faq as never,
        socialLinks: input.instagramUrl ? { instagram: input.instagramUrl } : {},
      },
    });

    await writeAudit(tx, {
      tournamentId,
      userId: ctx.userId,
      action: "config.update",
      entity: "TournamentConfig",
      entityId: before.id,
      previousValue: {
        maxTeams: before.maxTeams,
        earlyPrice: before.earlyPrice,
        latePrice: before.latePrice,
        paymentSurchargeBp: before.paymentSurchargeBp,
        priceChangeAt: before.priceChangeAt,
        tiebreakers: before.tiebreakers,
      },
      newValue: {
        maxTeams: input.maxTeams,
        earlyPrice: input.earlyPrice,
        latePrice: input.latePrice,
        paymentSurchargeBp: Math.round(input.paymentSurchargePct * 100),
        priceChangeAt: input.priceChangeAt,
        tiebreakers: input.tiebreakers,
      },
      ip: ctx.ip ?? null,
    });
  });

  return { warnings };
}
