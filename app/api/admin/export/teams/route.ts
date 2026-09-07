import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { toCsv } from "@/lib/csv";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament/status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    const url = new URL("/staff", req.url);
    url.searchParams.set("callbackUrl", "/admin/equipos");
    return NextResponse.redirect(url);
  }
  if (user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const tournament = await getActiveTournament();
  const teams = await db.team.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { createdAt: "asc" },
    include: { registration: true, _count: { select: { players: true } } },
  });
  // Cantidad de JUGADORES reales (isPlayer=true) por equipo, aparte del plantel total.
  const playerCounts = await db.player.groupBy({
    by: ["teamId"],
    where: { tournamentId: tournament.id, isPlayer: true },
    _count: true,
  });
  const realPlayersByTeam = new Map(playerCounts.map((r) => [r.teamId, r._count]));

  const csv = toCsv(
    [
      "nombre",
      "nombre_corto",
      "club",
      "responsable",
      "email",
      "telefono",
      "plantel_total",
      "jugadores_reales",
      "estado",
      "tarifa",
      "total_ars",
      "alta",
    ],
    teams.map((t) => [
      t.name,
      t.shortName ?? "",
      t.clubTag ?? "",
      t.contactName,
      t.contactEmail,
      t.contactPhone,
      t._count.players,
      realPlayersByTeam.get(t.id) ?? 0,
      REGISTRATION_STATUS_LABEL[t.registrationStatus],
      t.registration?.priceTier ?? "",
      t.registration ? Math.round(t.registration.totalAmount / 100) : "",
      t.createdAt.toISOString(),
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="equipos-${tournament.slug}.csv"`,
    },
  });
}
