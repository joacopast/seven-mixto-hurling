import type { Metadata } from "next";
import Link from "next/link";
import { getActiveTournament, getCapacity, registrationIsOpen } from "@/lib/tournament/queries";
import { Wizard, type WizardConfig } from "./wizard";
import { WaitlistForm } from "./waitlist-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inscribí a tu equipo",
  description: "Inscripción online al torneo Seven Mixto Hurling. Cargá tu equipo, tu plantel y pagá con Mercado Pago.",
};

const INCLUSIONS_FALLBACK = [
  "1 súper pancho por jugador",
  "Acceso a vestuarios",
  "Fruta e hidratación",
  "Sorteos",
  "Descuento exclusivo para el after",
  "Fotógrafos",
  "Fútbol, tenis y parrilla",
];

export default async function InscripcionPage() {
  const tournament = await getActiveTournament();
  const config = tournament.config!;
  const capacity = await getCapacity();
  const open = registrationIsOpen(tournament);

  if (!open) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-semibold text-ink">Las inscripciones no están abiertas</h1>
        <p className="mt-3 text-ink-soft">
          Todavía no se habilitó la inscripción para {tournament.edition}. Seguí las redes del club
          para enterarte de la apertura.
        </p>
        <Link href="/torneo" className="mt-6 inline-block text-accent underline">
          Ver estado del torneo
        </Link>
      </Shell>
    );
  }

  if (capacity.isFull) {
    return (
      <Shell>
        <h1 className="font-display text-3xl font-semibold text-ink">Cupos completos</h1>
        <p className="mt-3 text-ink-soft">
          Se llenaron los {capacity.maxTeams} equipos. Podés sumarte a la lista de espera: si se
          libera un lugar, te avisamos por email y te habilitamos el pago.
        </p>
        <div className="mt-8 max-w-md">
          <WaitlistForm />
        </div>
      </Shell>
    );
  }

  const inclusions = config.inclusionsList.length ? config.inclusionsList : INCLUSIONS_FALLBACK;

  const wizardConfig: WizardConfig = {
    basePlayers: config.basePlayers,
    earlyPrice: config.earlyPrice,
    latePrice: config.latePrice,
    extraPlayerPrice: config.extraPlayerPrice,
    priceChangeAtISO: config.priceChangeAt.toISOString(),
    paymentSurchargeBp: config.paymentSurchargeBp,
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    playersOnField: config.playersOnField,
    maxMenOnField: config.maxMenOnField,
    minPlayerAge: config.minPlayerAge,
    tournamentStartISO: (tournament.startDate ?? config.priceChangeAt).toISOString(),
    inclusions,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <p className="font-mono text-xs uppercase tracking-wide text-ink-faint">{tournament.edition}</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Inscribí a tu equipo
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {capacity.available} cupos disponibles de {capacity.maxTeams}.
        </p>
      </div>
      <Wizard config={wizardConfig} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">{children}</div>
  );
}
