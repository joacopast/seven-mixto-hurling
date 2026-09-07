import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SLUG = process.env.ACTIVE_TOURNAMENT_SLUG ?? "seven-mixto-hurling-2026";

const INCLUSIONS = [
  "1 súper pancho por jugador",
  "Acceso a vestuarios",
  "Fruta e hidratación",
  "Sorteos",
  "Descuento exclusivo para el after",
  "Fotógrafos",
  "Fútbol y tenis",
  "Parrilla",
];

const FAQ = [
  {
    q: "¿Cuántos jugadores puedo anotar?",
    a: "El plantel admite entre 7 y 20 jugadores. En cancha se juega de a 7, con un máximo de 3 hombres y sin arquero.",
  },
  {
    q: "¿Todos los equipos juegan después de la fase de grupos?",
    a: "Sí. Los 64 equipos pasan a una de las cuatro copas — Oro, Plata, Bronce o Madera — según su posición en el grupo. Nadie queda eliminado.",
  },
  {
    q: "¿Cómo se paga?",
    a: "Online con Mercado Pago, al final de la inscripción. La inscripción queda confirmada automáticamente cuando se acredita el pago.",
  },
  {
    q: "¿Puedo editar mi equipo después de inscribirme?",
    a: "Sí, desde el portal del equipo, hasta la fecha límite que define la organización.",
  },
];

const RULES = `Formato
- 64 equipos. Fase de grupos: 16 grupos de 4, todos contra todos (3 partidos por equipo).
- Después de grupos, los 64 equipos pasan a una copa según su posición: 1º → Oro, 2º → Plata, 3º → Bronce, 4º → Madera.
- Cada copa se juega por eliminación directa: octavos, cuartos, semifinal y final.

Partidos
- Duración: 15 minutos.
- Se juegan 6 partidos en simultáneo.
- Todos los partidos de una tanda empiezan y terminan al mismo horario.
- Si un equipo no se presenta en tiempo y forma, pierde los puntos.

Reglas de juego
- 7 personas en cancha.
- Máximo 3 hombres en cancha.
- Se juega sin arquero.
- Está prohibido jugar de flick y/o pegada.`;

async function main() {
  const tournament = await db.tournament.upsert({
    where: { slug: SLUG },
    update: {},
    create: {
      slug: SLUG,
      name: "Seven Mixto Hurling 2026",
      edition: "Edición 2026",
      venueName: "Club",
      startDate: new Date("2026-12-06T08:00:00-03:00"),
      endDate: new Date("2026-12-06T20:00:00-03:00"),
      status: "REGISTRATION_OPEN",
    },
  });

  await db.tournamentConfig.upsert({
    where: { tournamentId: tournament.id },
    update: {},
    create: {
      tournamentId: tournament.id,
      // Estructura
      maxTeams: 64,
      groupCount: 16,
      groupSize: 4,
      cupNames: ["ORO", "PLATA", "BRONCE", "MADERA"],
      cupSize: 16,
      cupAssignmentStrategy: "GROUP_POSITION",
      bracketSeeding: "PERFORMANCE",
      thirdPlaceMatch: false,
      // Partidos
      matchDurationMin: 15,
      fieldCount: 6,
      turnoverMin: 5,
      drawResolution: "SHOOTOUT",
      // Puntos
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      pointsWalkover: 3,
      walkoverScore: "3-0",
      tiebreakers: ["POINTS", "HEAD_TO_HEAD", "GOAL_DIFF", "GOALS_FOR", "FAIR_PLAY", "DRAW_LOTS"],
      // Plantel
      minPlayers: 7,
      maxPlayers: 20,
      playersOnField: 7,
      maxMenOnField: 3,
      minPlayerAge: 16,
      // Precios (centavos ARS). PENDIENTE: confirmar recargo y fecha de cambio.
      basePlayers: 10,
      earlyPrice: 275_000_00,
      latePrice: 300_000_00,
      extraPlayerPrice: 27_500_00,
      priceChangeAt: new Date("2026-11-15T00:00:00-03:00"),
      paymentSurchargeBp: 600,
      currency: "ARS",
      // Fechas
      registrationOpensAt: new Date("2026-09-01T00:00:00-03:00"),
      registrationClosesAt: new Date("2026-12-01T23:59:00-03:00"),
      teamEditLockAt: new Date("2026-12-03T23:59:00-03:00"),
      rosterLockAt: new Date("2026-12-04T23:59:00-03:00"),
      waitlistPaymentWindowHours: 48,
      // Contenido
      rulesMarkdown: RULES,
      inclusionsList: INCLUSIONS,
      faq: FAQ,
      socialLinks: { instagram: "https://www.instagram.com/sevenmixtohurling/" },
    },
  });

  // Canchas por defecto
  const existingFields = await db.field.count({ where: { tournamentId: tournament.id } });
  if (existingFields === 0) {
    await db.field.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        tournamentId: tournament.id,
        name: `Cancha ${i + 1}`,
        order: i + 1,
      })),
    });
  }

  // Usuarios ADMIN desde la allowlist
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of adminEmails) {
    await db.user.upsert({
      where: { email },
      update: { role: "ADMIN" },
      create: { email, role: "ADMIN", name: "Organización" },
    });
  }

  console.log(`Seed OK — torneo "${tournament.slug}" (${adminEmails.length} admin/s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
