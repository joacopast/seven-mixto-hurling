import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { ACTIVE_TOURNAMENT_SLUG } from "@/lib/config";
import type { Prisma } from "@prisma/client";

/** Estados de inscripción que ocupan un cupo del torneo. */
export const OCCUPYING_STATUSES = [
  "PENDING_PAYMENT",
  "PAYMENT_STARTED",
  "PAYMENT_APPROVED",
  "CONFIRMED",
] as const;

export const CONFIRMED_STATUSES = ["PAYMENT_APPROVED", "CONFIRMED"] as const;

export type TournamentWithConfig = Prisma.TournamentGetPayload<{
  include: { config: true };
}>;

/** Torneo activo con su configuración. Cacheado por request. */
export const getActiveTournament = cache(async (): Promise<TournamentWithConfig> => {
  const tournament = await db.tournament.findUnique({
    where: { slug: ACTIVE_TOURNAMENT_SLUG },
    include: { config: true },
  });
  if (!tournament || !tournament.config) {
    throw new Error(
      `No hay torneo activo con slug "${ACTIVE_TOURNAMENT_SLUG}". Corré \`npm run db:seed\`.`,
    );
  }
  return tournament;
});

export interface CapacitySnapshot {
  maxTeams: number;
  confirmed: number;
  occupying: number;
  available: number;
  isFull: boolean;
  waitlistCount: number;
}

export const getCapacity = cache(async (): Promise<CapacitySnapshot> => {
  const tournament = await getActiveTournament();
  const [confirmed, occupying, waitlistCount] = await Promise.all([
    db.team.count({
      where: {
        tournamentId: tournament.id,
        registrationStatus: { in: [...CONFIRMED_STATUSES] },
      },
    }),
    db.team.count({
      where: {
        tournamentId: tournament.id,
        registrationStatus: { in: [...OCCUPYING_STATUSES] },
      },
    }),
    db.team.count({
      where: { tournamentId: tournament.id, registrationStatus: "WAITLISTED" },
    }),
  ]);

  const maxTeams = tournament.config!.maxTeams;
  return {
    maxTeams,
    confirmed,
    occupying,
    available: Math.max(0, maxTeams - occupying),
    isFull: occupying >= maxTeams,
    waitlistCount,
  };
});

export function registrationIsOpen(tournament: TournamentWithConfig, now = new Date()): boolean {
  if (tournament.status !== "REGISTRATION_OPEN") return false;
  const opens = tournament.config?.registrationOpensAt;
  const closes = tournament.config?.registrationClosesAt;
  if (opens && now < opens) return false;
  if (closes && now > closes) return false;
  return true;
}
