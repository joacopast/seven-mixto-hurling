import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { NewTeamForm } from "./new-team-form";

export const metadata = { title: "Nuevo equipo", robots: { index: false } };

export const dynamic = "force-dynamic";

export default async function NuevoEquipoPage() {
  const tournament = await getActiveTournament();
  const takenTeams = await db.team.findMany({
    where: { tournamentId: tournament.id, registrationStatus: { not: "CANCELLED" } },
    select: { name: true },
  });
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <Link href="/admin/equipos" className="text-sm text-accent">
        ← Equipos
      </Link>
      <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
        Crear equipo
      </h1>
      <p className="text-sm text-ink-soft">
        Para equipos invitados o cargados a mano. Los jugadores se agregan después desde la ficha
        del equipo.
      </p>
      <NewTeamForm takenCountries={takenTeams.map((t) => t.name)} />
    </div>
  );
}
