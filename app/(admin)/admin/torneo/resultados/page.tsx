import Link from "next/link";
import { getActiveTournament } from "@/lib/tournament/queries";
import { getGroupFixture } from "@/lib/tournament/groups-view";
import { ResultRow } from "./result-row";
import { RescheduleRoundButton } from "./reschedule-round";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resultados", robots: { index: false } };

export default async function ResultadosPage() {
  const tournament = await getActiveTournament();
  const fixture = await getGroupFixture(tournament.id);

  if (fixture.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/admin/torneo" className="text-sm text-accent">
          ← Torneo
        </Link>
        <p className="text-ink-soft">Todavía no hay fixture. Generalo desde la página del torneo.</p>
      </div>
    );
  }

  const byTanda = new Map<number, typeof fixture>();
  for (const m of fixture) {
    const arr = byTanda.get(m.tanda) ?? [];
    arr.push(m);
    byTanda.set(m.tanda, arr);
  }

  const played = fixture.filter((m) => m.status === "FINISHED" || m.status === "WALKOVER").length;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/torneo" className="text-sm text-accent">
        ← Torneo
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
          Resultados — fase de grupos
        </h1>
        <span className="font-mono text-sm text-ink-faint">
          {played}/{fixture.length} cargados
        </span>
      </div>

      {[...byTanda.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([tanda, matches]) => (
          <section key={tanda}>
            <h2 className="mb-2 flex flex-wrap items-center gap-2 font-display text-lg font-semibold text-paper">
              {matches[0]!.tandaLabel}
              <span className="font-sans text-xs font-normal text-ink-faint">
                {matches[0]!.startsAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {matches[0]!.roundId && (
                <RescheduleRoundButton roundId={matches[0]!.roundId} startsAt={matches[0]!.startsAt} />
              )}
            </h2>
            <div className="overflow-hidden rounded-card border border-line-soft">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line-soft">
                  {matches.map((m) => (
                    <ResultRow key={m.id} match={m} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </div>
  );
}
