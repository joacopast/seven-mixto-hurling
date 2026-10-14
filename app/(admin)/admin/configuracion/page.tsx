import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { ConfigForm, type ConfigValues } from "./config-form";
import { ResetTournamentDangerZone } from "./danger-zone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configuración", robots: { index: false } };

/** Date → valor para <input type="datetime-local"> (hora local). */
function toLocalInput(d: Date | null | undefined): string {
  if (!d) return "";
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export default async function AdminConfigPage() {
  const tournament = await getActiveTournament();
  const c = tournament.config!;

  const [groupCount, matchCount] = await Promise.all([
    db.group.count({ where: { tournamentId: tournament.id } }),
    db.match.count({ where: { tournamentId: tournament.id } }),
  ]);

  const social = (c.socialLinks as { instagram?: string } | null) ?? {};
  const faq = c.faq;

  const values: ConfigValues = {
    name: tournament.name,
    edition: tournament.edition,
    venueName: tournament.venueName ?? "",
    startDate: toLocalInput(tournament.startDate),
    endDate: toLocalInput(tournament.endDate),
    maxTeams: c.maxTeams,
    groupCount: c.groupCount,
    groupSize: c.groupSize,
    cupNames: c.cupNames.join(", "),
    cupAssignmentStrategy: c.cupAssignmentStrategy,
    thirdPlaceMatch: c.thirdPlaceMatch,
    matchDurationMin: c.matchDurationMin,
    fieldCount: c.fieldCount,
    turnoverMin: c.turnoverMin,
    drawResolution: c.drawResolution,
    pointsWin: c.pointsWin,
    pointsDraw: c.pointsDraw,
    pointsLoss: c.pointsLoss,
    pointsWalkover: c.pointsWalkover,
    walkoverScore: c.walkoverScore,
    tiebreakers: c.tiebreakers,
    minPlayers: c.minPlayers,
    maxPlayers: c.maxPlayers,
    playersOnField: c.playersOnField,
    maxMenOnField: c.maxMenOnField,
    minPlayerAge: c.minPlayerAge,
    basePlayers: c.basePlayers,
    earlyPricePesos: Math.round(c.earlyPrice / 100),
    latePricePesos: Math.round(c.latePrice / 100),
    extraPlayerPricePesos: Math.round(c.extraPlayerPrice / 100),
    priceChangeAt: toLocalInput(c.priceChangeAt),
    paymentSurchargePct: c.paymentSurchargeBp / 100,
    paymentMethod: c.paymentMethod,
    bankHolderName: c.bankHolderName ?? "",
    bankCuit: c.bankCuit ?? "",
    bankName: c.bankName ?? "",
    bankAlias: c.bankAlias ?? "",
    bankCbu: c.bankCbu ?? "",
    whatsappPhone: c.whatsappPhone ?? "",
    whatsappMessageTemplate: c.whatsappMessageTemplate ?? "",
    registrationOpensAt: toLocalInput(c.registrationOpensAt),
    registrationClosesAt: toLocalInput(c.registrationClosesAt),
    rosterLockAt: toLocalInput(c.rosterLockAt),
    teamEditLockAt: toLocalInput(c.teamEditLockAt),
    waitlistPaymentWindowHours: c.waitlistPaymentWindowHours,
    rulesMarkdown: c.rulesMarkdown,
    inclusionsList: c.inclusionsList.join("\n"),
    faqJson: Array.isArray(faq) ? JSON.stringify(faq, null, 2) : "[]",
    instagramUrl: social.instagram ?? "",
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
        Configuración del torneo
      </h1>
      <ConfigForm values={values} structureLocked={groupCount > 0 || matchCount > 0} />
      <ResetTournamentDangerZone tournamentName={tournament.name} />
    </div>
  );
}
