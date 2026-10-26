import Link from "next/link";
import { getActiveTournament } from "@/lib/tournament/queries";
import { getCupsWithBrackets } from "@/lib/tournament/bracket-view";
import { ROUND_LABEL } from "@/lib/tournament/bracket";
import { BracketView } from "@/components/bracket-view";
import { CupResultRow } from "./cup-result-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Copas", robots: { index: false } };

export default async function AdminCopasPage() {
  const tournament = await getActiveTournament();
  const cups = await getCupsWithBrackets(tournament.id);

  if (cups.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/admin/torneo" className="text-sm text-accent">
          ← Torneo
        </Link>
        <p className="text-ink-soft">
          Todavía no se generaron las copas. Terminá la fase de grupos y generalas desde la página
          del torneo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <Link href="/admin/torneo" className="text-sm text-accent">
        ← Torneo
      </Link>
      <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
        Copas — llaves y resultados
      </h1>

      {cups.map((cup) => (
        <section key={cup.id} className="flex flex-col gap-4">
          <BracketView cup={cup} />

          <div className="overflow-hidden rounded-card border border-line-soft">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line-soft">
                {cup.rounds
                  .filter((r) => r.matches.length > 0)
                  .flatMap((r) => r.matches.map((m) => <CupResultRow key={m.matchId} m={m} />))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-xs text-ink-faint">
        Rondas: {Object.values(ROUND_LABEL).join(" → ")}. Empate en copa: se define por penales. Los
        perdedores de semifinal comparten el 3er puesto.
      </p>
    </div>
  );
}
