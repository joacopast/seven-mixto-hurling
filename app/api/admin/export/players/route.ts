import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { toCsv } from "@/lib/csv";

export async function GET() {
  const user = await getSessionUser();
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tournament = await getActiveTournament();
  const players = await db.player.findMany({
    where: { tournamentId: tournament.id },
    orderBy: [{ team: { name: "asc" } }, { lastName: "asc" }],
    include: { team: { select: { name: true } } },
  });

  const csv = toCsv(
    ["equipo", "nombre", "apellido", "tipo_doc", "documento", "nacimiento", "genero", "numero", "telefono", "email"],
    players.map((p) => [
      p.team.name,
      p.firstName,
      p.lastName,
      p.docType,
      p.docNumber,
      p.birthDate.toISOString().slice(0, 10),
      p.gender,
      p.shirtNumber ?? "",
      p.phone ?? "",
      p.email ?? "",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jugadores-${tournament.slug}.csv"`,
    },
  });
}
