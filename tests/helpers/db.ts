import { PrismaClient } from "@prisma/client";
import { ACTIVE_TOURNAMENT_SLUG } from "@/lib/config";

export const testDb = new PrismaClient();

/** Borra todos los datos de dominio, respetando el orden de las FK. */
export async function resetDb() {
  await testDb.$transaction([
    testDb.auditLog.deleteMany(),
    testDb.notification.deleteMany(),
    testDb.webhookEvent.deleteMany(),
    testDb.payment.deleteMany(),
    testDb.matchSlot.deleteMany(),
    testDb.bracketMatch.deleteMany(),
    testDb.bracket.deleteMany(),
    testDb.match.deleteMany(),
    testDb.round.deleteMany(),
    testDb.groupTeam.deleteMany(),
    testDb.player.deleteMany(),
    testDb.registration.deleteMany(),
    testDb.team.deleteMany(),
    testDb.group.deleteMany(),
    testDb.cup.deleteMany(),
    testDb.field.deleteMany(),
    testDb.tournamentConfig.deleteMany(),
    testDb.tournament.deleteMany(),
    testDb.session.deleteMany(),
    testDb.account.deleteMany(),
    testDb.user.deleteMany(),
  ]);
}

export interface SeedOverrides {
  status?: Parameters<typeof testDb.tournament.create>[0]["data"]["status"];
  maxTeams?: number;
  paymentSurchargeBp?: number;
  priceChangeAt?: Date;
  registrationClosesAt?: Date | null;
}

/** Crea el torneo activo con configuración por defecto (valores del pliego). */
export async function seedTournament(overrides: SeedOverrides = {}) {
  const tournament = await testDb.tournament.create({
    data: {
      slug: ACTIVE_TOURNAMENT_SLUG,
      name: "Seven Mixto Hurling 2026",
      edition: "Edición 2026",
      status: overrides.status ?? "REGISTRATION_OPEN",
      startDate: new Date("2026-12-06T08:00:00-03:00"),
      config: {
        create: {
          maxTeams: overrides.maxTeams ?? 64,
          minPlayers: 7,
          maxPlayers: 20,
          playersOnField: 7,
          maxMenOnField: 3,
          minPlayerAge: 16,
          basePlayers: 10,
          earlyPrice: 275_000_00,
          latePrice: 300_000_00,
          extraPlayerPrice: 27_500_00,
          priceChangeAt: overrides.priceChangeAt ?? new Date("2026-11-15T00:00:00-03:00"),
          paymentSurchargeBp: overrides.paymentSurchargeBp ?? 0,
          registrationClosesAt:
            overrides.registrationClosesAt === undefined
              ? new Date("2026-12-01T23:59:00-03:00")
              : overrides.registrationClosesAt,
        },
      },
    },
    include: { config: true },
  });
  return tournament;
}

/** Crea N equipos confirmados con `playersPerTeam` jugadores cada uno. */
export async function seedConfirmedTeams(
  tournamentId: string,
  count: number,
  opts: { playersPerTeam?: number; withSeeds?: boolean; prefix?: string } = {},
) {
  const playersPerTeam = opts.playersPerTeam ?? 0;
  const prefix = opts.prefix ?? "team";
  const teams: { id: string; name: string }[] = [];
  for (let i = 0; i < count; i++) {
    const email = `${prefix}${i}@test.local`;
    const user = await testDb.user.create({ data: { email, name: `M${i}`, role: "TEAM_MANAGER" } });
    const team = await testDb.team.create({
      data: {
        tournamentId,
        name: `Equipo ${prefix}${String(i + 1).padStart(2, "0")}`,
        slug: `equipo-${prefix}-${i}`,
        managerUserId: user.id,
        contactName: `M${i}`,
        contactEmail: email,
        contactPhone: "1",
        registrationStatus: "CONFIRMED",
        paymentStatus: "APPROVED",
        seed: opts.withSeeds ? i + 1 : null,
        registeredAt: new Date(Date.now() - (count - i) * 1000),
        registration: {
          create: { tournamentId, status: "CONFIRMED", totalAmount: 0 },
        },
        players: playersPerTeam
          ? {
              create: Array.from({ length: playersPerTeam }, (_, p) => ({
                tournamentId,
                firstName: `J${p}`,
                lastName: "X",
                docNumber: `${i}-${p}`,
                birthDate: new Date("1996-01-01"),
                gender: (p % 2 ? "M" : "F") as "M" | "F",
              })),
            }
          : undefined,
      },
    });
    teams.push({ id: team.id, name: team.name });
  }
  return teams;
}
