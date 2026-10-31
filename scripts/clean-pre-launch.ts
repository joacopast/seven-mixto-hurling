/**
 * Limpia los datos de prueba del torneo activo antes de abrir inscripciones de verdad.
 *
 * Borra: equipos, jugadores, inscripciones, pagos, grupos, copas, llaves, partidos,
 * notificaciones, auditoría, webhooks de MP, usuarios TEAM_MANAGER (y sus sesiones) y
 * magic links vencidos.
 *
 * Conserva: el Tournament, su TournamentConfig (fechas/precios/alias-CBU reales), las
 * canchas (Field) y los usuarios ADMIN de staff. El torneo queda en REGISTRATION_OPEN.
 *
 * Por default corre en modo dry-run (solo cuenta filas, no borra nada).
 * Uso:
 *   npx tsx scripts/clean-pre-launch.ts                 # dry-run
 *   CONFIRM=yes npx tsx scripts/clean-pre-launch.ts --execute   # borra de verdad
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const SLUG = process.env.ACTIVE_TOURNAMENT_SLUG ?? "seven-mixto-hurling-2026";
const EXECUTE = process.argv.includes("--execute");

async function main() {
  const tournament = await db.tournament.findUnique({ where: { slug: SLUG } });
  if (!tournament) {
    console.error(`No se encontró el torneo "${SLUG}". Nada para hacer.`);
    process.exit(1);
  }

  const where = { tournamentId: tournament.id };
  const counts = {
    bracketMatch: await db.bracketMatch.count({ where: { bracket: { cup: where } } }),
    matchSlot: await db.matchSlot.count({ where: { round: where } }),
    match: await db.match.count({ where }),
    bracket: await db.bracket.count({ where: { cup: where } }),
    groupTeam: await db.groupTeam.count({ where: { group: where } }),
    payment: await db.payment.count({ where: { registration: where } }),
    registration: await db.registration.count({ where }),
    player: await db.player.count({ where: { tournamentId: tournament.id } }),
    team: await db.team.count({ where }),
    group: await db.group.count({ where }),
    cup: await db.cup.count({ where }),
    round: await db.round.count({ where }),
    notification: await db.notification.count(),
    webhookEvent: await db.webhookEvent.count(),
    auditLog: await db.auditLog.count(),
    teamManagerUsers: await db.user.count({ where: { role: { not: "ADMIN" } } }),
    verificationToken: await db.verificationToken.count(),
  };
  const kept = {
    field: await db.field.count({ where }),
    adminUsers: await db.user.count({ where: { role: "ADMIN" } }),
  };

  console.log(`Torneo: "${tournament.name}" (${tournament.slug}) — estado actual: ${tournament.status}`);
  console.log("\nSe BORRA:");
  console.table(counts);
  console.log("Se CONSERVA: Tournament, TournamentConfig, canchas y admins:");
  console.table(kept);

  if (!EXECUTE) {
    console.log('\nDry-run (no se borró nada). Para ejecutar de verdad:');
    console.log("  CONFIRM=yes npx tsx scripts/clean-pre-launch.ts --execute");
    return;
  }

  if (process.env.CONFIRM !== "yes") {
    console.error('\nFalta CONFIRM=yes en el entorno. Abortado sin tocar nada.');
    process.exit(1);
  }

  await db.$transaction(async (tx) => {
    await tx.bracketMatch.deleteMany({ where: { bracket: { cup: where } } });
    await tx.matchSlot.deleteMany({ where: { round: where } });
    await tx.match.deleteMany({ where });
    await tx.bracket.deleteMany({ where: { cup: where } });
    await tx.groupTeam.deleteMany({ where: { group: where } });
    await tx.payment.deleteMany({ where: { registration: where } });
    await tx.registration.deleteMany({ where });
    await tx.player.deleteMany({ where: { tournamentId: tournament.id } });
    await tx.team.deleteMany({ where });
    await tx.group.deleteMany({ where });
    await tx.cup.deleteMany({ where });
    await tx.round.deleteMany({ where });
    await tx.notification.deleteMany({});
    await tx.webhookEvent.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.user.deleteMany({ where: { role: { not: "ADMIN" } } }); // cascada: Account, Session
    await tx.verificationToken.deleteMany({});

    await tx.tournament.update({
      where: { id: tournament.id },
      data: { status: "REGISTRATION_OPEN" },
    });
  }, { timeout: 60_000, maxWait: 10_000 });

  console.log("\nListo. Base limpia, torneo en REGISTRATION_OPEN, config/canchas/admins intactos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
