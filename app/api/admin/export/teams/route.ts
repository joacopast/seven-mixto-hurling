import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { toCsv } from "@/lib/csv";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament/status";

export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tournament = await getActiveTournament();
  const teams = await db.team.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { createdAt: "asc" },
    include: { registration: true, _count: { select: { players: true } } },
  });

  const csv = toCsv(
    [
      "nombre",
      "nombre_corto",
      "club",
      "responsable",
      "email",
      "telefono",
      "jugadores",
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
