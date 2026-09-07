import Link from "next/link";
import { NewTeamForm } from "./new-team-form";

export const metadata = { title: "Nuevo equipo", robots: { index: false } };

export default function NuevoEquipoPage() {
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
      <NewTeamForm />
    </div>
  );
}
