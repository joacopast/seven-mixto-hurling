import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { ageOn } from "@/lib/tournament/roster";
import { toCsv } from "@/lib/csv";

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
  const ageReference = tournament.startDate ?? new Date();
  const players = await db.player.findMany({
    where: { tournamentId: tournament.id },
    orderBy: [{ team: { name: "asc" } }, { lastName: "asc" }],
    include: { team: { select: { name: true } } },
  });

  const csv = toCsv(
    [
      "equipo",
      "nombre",
      "apellido",
      "tipo_doc",
      "documento",
      "nacimiento",
      "edad",
      "genero",
      "jugador",
      "numero",
      "telefono",
      "email",
      "restriccion_alimenticia",
      "va_a_la_fiesta",
    ],
    players.map((p) => [
      p.team.name,
      p.firstName,
      p.lastName,
      p.docType,
      p.docNumber,
      p.birthDate.toISOString().slice(0, 10),
      ageOn(p.birthDate, ageReference),
      p.gender,
      p.isPlayer ? "Sí" : "No",
      p.shirtNumber ?? "",
      p.phone ?? "",
      p.email ?? "",
      p.dietaryRestriction ?? "",
      p.attendsParty ? "Sí" : "No",
    ]),
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="jugadores-${tournament.slug}.csv"`,
    },
  });
}
