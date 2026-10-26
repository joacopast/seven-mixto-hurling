import type { Metadata } from "next";
import Link from "next/link";
import { getActiveTournament, getCapacity } from "@/lib/tournament/queries";
import { getGroupsWithStandings, getGroupFixture } from "@/lib/tournament/groups-view";
import { getCupsWithBrackets } from "@/lib/tournament/bracket-view";
import { Card, Badge } from "@/components/ui";
import { StandingsTable } from "@/components/standings-table";
import { BracketView, TournamentPodium } from "@/components/bracket-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Torneo",
  description: "Seguí el torneo: equipos, grupos, posiciones, resultados y horarios.",
};

const PHASE_LABEL: Record<string, string> = {
  SETUP: "En preparación",
  REGISTRATION_OPEN: "Inscripciones abiertas",
  REGISTRATION_CLOSED: "Inscripciones cerradas",
  GROUPS_PUBLISHED: "Grupos publicados",
  GROUPS_IN_PROGRESS: "Fase de grupos en juego",
  CUPS_PUBLISHED: "Copas publicadas",
  CUPS_IN_PROGRESS: "Copas en juego",
  FINISHED: "Finalizado",
};

const GROUPS_VISIBLE = ["GROUPS_PUBLISHED", "GROUPS_IN_PROGRESS", "CUPS_PUBLISHED", "CUPS_IN_PROGRESS", "FINISHED"];
const CUPS_VISIBLE = ["CUPS_PUBLISHED", "CUPS_IN_PROGRESS", "FINISHED"];

export default async function TorneoPage() {
  const tournament = await getActiveTournament();
  const capacity = await getCapacity();
  const showGroups = GROUPS_VISIBLE.includes(tournament.status);
  const showCups = CUPS_VISIBLE.includes(tournament.status);

  const [groups, fixture, cups] = await Promise.all([
    showGroups ? getGroupsWithStandings(tournament.id) : Promise.resolve([]),
    showGroups ? getGroupFixture(tournament.id) : Promise.resolve([]),
    showCups ? getCupsWithBrackets(tournament.id) : Promise.resolve([]),
  ]);

  const byTanda = new Map<number, typeof fixture>();
  for (const m of fixture) {
    const arr = byTanda.get(m.tanda) ?? [];
    arr.push(m);
    byTanda.set(m.tanda, arr);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper sm:text-4xl">
          {tournament.name}
        </h1>
        <Badge tone="accent">{PHASE_LABEL[tournament.status] ?? tournament.status}</Badge>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            Equipos confirmados
          </div>
          <div className="mt-1 font-display text-3xl font-semibold text-paper">
            {capacity.confirmed}
            <span className="text-lg text-ink-faint"> / {capacity.maxTeams}</span>
          </div>
        </Card>
        <Card>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            Cupos disponibles
          </div>
          <div className="mt-1 font-display text-3xl font-semibold text-paper">
            {capacity.available}
          </div>
        </Card>
        <Card>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            Lista de espera
          </div>
          <div className="mt-1 font-display text-3xl font-semibold text-paper">
            {capacity.waitlistCount}
          </div>
        </Card>
      </div>

      {!showGroups ? (
        <div className="mt-12 rounded-card border border-dashed border-line bg-surface p-10 text-center">
          <p className="font-display text-xl font-semibold text-paper">
            El fixture todavía no está publicado
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
            Cuando la organización cierre las inscripciones y arme los grupos, vas a ver acá los
            grupos, las posiciones, los horarios, los resultados y las llaves de las cuatro copas.
          </p>
        </div>
      ) : (
        <>
          {tournament.status === "FINISHED" && cups.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-1 font-display text-2xl font-semibold uppercase tracking-tight text-paper">
                🏆 Resultados finales
              </h2>
              <p className="mb-4 text-sm text-ink-soft">Campeón, subcampeón y 3er puesto de cada copa.</p>
              <TournamentPodium cups={cups} />
            </section>
          )}

          {showCups && cups.length > 0 && (
            <section className="mt-12">
              <h2 className="mb-4 font-display text-2xl font-semibold uppercase tracking-tight text-paper">
                Las cuatro copas
              </h2>
              <div className="grid gap-4 xl:grid-cols-2">
                {cups.map((cup) => (
                  <BracketView key={cup.id} cup={cup} />
                ))}
              </div>
            </section>
          )}

          <section className="mt-12">
            <h2 className="mb-4 font-display text-2xl font-semibold uppercase tracking-tight text-paper">
              Grupos y posiciones
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {groups.map((g) => (
                <StandingsTable key={g.id} group={g} />
              ))}
            </div>
            <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink-faint">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--cup-oro)" }} />
                1º → Oro
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--cup-plata)" }} />
                2º → Plata
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--cup-bronce)" }} />
                3º → Bronce
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: "var(--cup-madera)" }} />
                4º → Madera
              </span>
            </p>
          </section>

          <section className="mt-12">
            <h2 className="mb-4 font-display text-2xl font-semibold uppercase tracking-tight text-paper">
              Horarios y resultados
            </h2>
            <div className="flex flex-col gap-6">
              {[...byTanda.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([tanda, matches]) => (
                  <div key={tanda}>
                    <h3 className="mb-2 flex items-baseline gap-2 font-display text-lg font-semibold text-paper">
                      {matches[0]!.tandaLabel}
                      <span className="font-sans text-xs font-normal text-ink-faint">
                        {matches[0]!.startsAt.toLocaleTimeString("es-AR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {matches.map((m) => {
                        const finished = m.status === "FINISHED" || m.status === "WALKOVER";
                        return (
                          <div
                            key={m.id}
                            className={`min-w-0 rounded-2xl border px-3 py-2 text-sm ${
                              finished
                                ? "border-line-soft bg-surface"
                                : "border-dashed border-line bg-transparent"
                            }`}
                          >
                            <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-ink-faint">
                              <span>
                                Gr.{m.groupName} · {m.fieldName}
                              </span>
                              {m.status === "WALKOVER" && <Badge tone="warn">W.O.</Badge>}
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              {m.homeTeamId ? (
                                <Link
                                  href={`/equipos/${m.homeTeamId}`}
                                  className={`min-w-0 flex-1 text-xs leading-snug hover:underline sm:text-sm ${finished && m.walkoverTeamId === m.homeTeamId ? "font-semibold text-paper" : "text-ink"}`}
                                >
                                  {m.homeTeamName}
                                </Link>
                              ) : (
                                <span className="min-w-0 flex-1 text-xs leading-snug text-ink sm:text-sm">
                                  {m.homeTeamName}
                                </span>
                              )}
                              <span className="shrink-0 pt-0.5 font-mono font-semibold text-paper">
                                {finished
                                  ? m.status === "WALKOVER"
                                    ? m.walkoverTeamId
                                      ? m.walkoverTeamId === m.homeTeamId
                                        ? "W-0"
                                        : "0-W"
                                      : "0-0"
                                    : `${m.homeScore}-${m.awayScore}`
                                  : "vs"}
                              </span>
                              {m.awayTeamId ? (
                                <Link
                                  href={`/equipos/${m.awayTeamId}`}
                                  className={`min-w-0 flex-1 text-right text-xs leading-snug hover:underline sm:text-sm ${finished && m.walkoverTeamId === m.awayTeamId ? "font-semibold text-paper" : "text-ink"}`}
                                >
                                  {m.awayTeamName}
                                </Link>
                              ) : (
                                <span className="min-w-0 flex-1 text-right text-xs leading-snug text-ink sm:text-sm">
                                  {m.awayTeamName}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
