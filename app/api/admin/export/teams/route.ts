import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { toXlsx } from "@/lib/xlsx";
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
    include: { registration: { include: { payments: true } }, _count: { select: { players: true } } },
  });
  // Cantidad de jugadores reales (playsHockey=true) por equipo, aparte del plantel total.
  const playerCounts = await db.player.groupBy({
    by: ["teamId"],
    where: { tournamentId: tournament.id, playsHockey: true },
    _count: true,
  });
  const realPlayersByTeam = new Map(playerCounts.map((r) => [r.teamId, r._count]));

  const xlsx = await toXlsx(
    "Equipos",
    [
      "País",
      "Código",
      "Responsable",
      "Email",
      "Teléfono",
      "Plantel total",
      "Jugadores reales",
      "Estado",
      "Tarifa",
      "Total ($)",
      "Pagado ($)",
      "Falta ($)",
      "Alta",
    ],
    teams.map((t) => {
      const paid =
        t.registration?.payments.filter((p) => p.status === "APPROVED").reduce((s, p) => s + p.amount, 0) ?? 0;
      const owed = Math.max(0, (t.registration?.totalAmount ?? 0) - paid);
      return [
        t.name,
        t.shortName ?? "",
        t.contactName,
        t.contactEmail,
        t.contactPhone,
        t._count.players,
        realPlayersByTeam.get(t.id) ?? 0,
        REGISTRATION_STATUS_LABEL[t.registrationStatus],
        t.registration?.priceTier ?? "",
        t.registration ? Math.round(t.registration.totalAmount / 100) : "",
        Math.round(paid / 100),
        Math.round(owed / 100),
        t.createdAt.toLocaleString("es-AR"),
      ];
    }),
  );

  return new NextResponse(xlsx as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="equipos-${tournament.slug}.xlsx"`,
    },
  });
}
