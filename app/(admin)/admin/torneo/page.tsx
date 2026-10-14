import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { getGroupsWithStandings } from "@/lib/tournament/groups-view";
import { getCupsWithBrackets } from "@/lib/tournament/bracket-view";
import { getConfirmedTeams } from "@/lib/services/groups";
import { Card, Badge } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { StandingsTable } from "@/components/standings-table";
import { TournamentPodium } from "@/components/bracket-view";
import {
  closeRegistration,
  reopenRegistration,
  autoDrawGroups,
  generateFixture,
  publishGroups,
  startGroupPhase,
  generateCupsAction,
  reopenFromFinished,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Torneo", robots: { index: false } };

const STATUS_LABEL: Record<string, string> = {
  SETUP: "En preparación",
  REGISTRATION_OPEN: "Inscripción abierta",
  REGISTRATION_CLOSED: "Inscripción cerrada",
  GROUPS_PUBLISHED: "Grupos publicados",
  GROUPS_IN_PROGRESS: "Fase de grupos en juego",
  CUPS_PUBLISHED: "Copas publicadas",
  CUPS_IN_PROGRESS: "Copas en juego",
  FINISHED: "Finalizado",
};

export default async function AdminTorneoPage() {
  const tournament = await getActiveTournament();
  const [confirmed, groups, groupMatchCount, playedCount, cupCount, cupPlayed, cupTotal] =
    await Promise.all([
      getConfirmedTeams(tournament.id),
      getGroupsWithStandings(tournament.id),
      db.match.count({ where: { tournamentId: tournament.id, phase: "GROUP" } }),
      db.match.count({
        where: { tournamentId: tournament.id, phase: "GROUP", status: { in: ["FINISHED", "WALKOVER"] } },
      }),
      db.cup.count({ where: { tournamentId: tournament.id } }),
      db.match.count({
        where: { tournamentId: tournament.id, phase: "CUP", status: { in: ["FINISHED", "WALKOVER"] } },
      }),
      db.match.count({ where: { tournamentId: tournament.id, phase: "CUP" } }),
    ]);

  const s = tournament.status;
  const hasFixture = groupMatchCount > 0;
  const allGroupPlayed = groupMatchCount > 0 && playedCount === groupMatchCount;
  const allCupsPlayed = cupTotal > 0 && cupPlayed === cupTotal;
  const cups = allCupsPlayed || s === "FINISHED" ? await getCupsWithBrackets(tournament.id) : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
          Torneo
        </h1>
        <Badge tone="accent">{STATUS_LABEL[s] ?? s}</Badge>
      </div>

      {/* Pipeline */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-paper">Fase de grupos — pasos</h2>
        <ol className="mt-4 flex flex-col gap-4">
          <Step
            n={1}
            title="Cerrar inscripción"
            done={s !== "REGISTRATION_OPEN" && s !== "SETUP"}
            detail={`${confirmed.length} equipos confirmados`}
          >
            {s === "REGISTRATION_OPEN" && (
              <ActionButton action={closeRegistration} confirm="¿Cerrar la inscripción?">
                Cerrar inscripción
              </ActionButton>
            )}
            {s === "REGISTRATION_CLOSED" && (
              <ActionButton action={reopenRegistration} variant="ghost">
                Reabrir inscripción
              </ActionButton>
            )}
          </Step>

          <Step
            n={2}
            title="Armar grupos"
            done={groups.length > 0}
            detail={
              groups.length > 0
                ? `${groups.length} grupos`
                : `objetivo: ${tournament.config!.groupCount} grupos de ${tournament.config!.groupSize}`
            }
          >
            {(s === "REGISTRATION_CLOSED" || s === "GROUPS_PUBLISHED") && playedCount === 0 && (
              <div className="flex flex-wrap gap-2">
                <ActionButton
                  action={autoDrawGroups}
                  confirm={groups.length > 0 ? "Esto reemplaza el sorteo actual. ¿Seguir?" : undefined}
                >
                  Sortear automáticamente
                </ActionButton>
                <Link
                  href="/admin/torneo/grupos"
                  className="inline-flex h-10 items-center rounded-full border border-ink/25 px-5 text-sm font-semibold text-ink hover:bg-surface-2"
                >
                  Armar / editar a mano
                </Link>
              </div>
            )}
          </Step>

          <Step
            n={3}
            title="Generar fixture"
            done={hasFixture}
            detail={hasFixture ? `${groupMatchCount} partidos` : "round-robin + horarios + canchas"}
          >
            {groups.length > 0 &&
              playedCount === 0 &&
              (s === "REGISTRATION_CLOSED" || s === "GROUPS_PUBLISHED") && (
                <ActionButton
                  action={generateFixture}
                  confirm={hasFixture ? "Regenera el fixture completo. ¿Seguir?" : undefined}
                >
                  {hasFixture ? "Regenerar fixture" : "Generar fixture"}
                </ActionButton>
              )}
          </Step>

          <Step
            n={4}
            title="Publicar y jugar la fase de grupos"
            done={["GROUPS_PUBLISHED", "GROUPS_IN_PROGRESS", "CUPS_PUBLISHED", "CUPS_IN_PROGRESS", "FINISHED"].includes(s)}
            detail={hasFixture ? `${playedCount}/${groupMatchCount} resultados` : "visible en /torneo"}
          >
            {s === "REGISTRATION_CLOSED" && hasFixture && (
              <ActionButton action={publishGroups} variant="primary">
                Publicar grupos y fixture
              </ActionButton>
            )}
            {s === "GROUPS_PUBLISHED" && (
              <ActionButton action={startGroupPhase} variant="primary">
                Marcar “en juego”
              </ActionButton>
            )}
          </Step>

          <Step
            n={5}
            title="Generar copas y llaves"
            done={cupCount > 0}
            detail={
              cupCount > 0
                ? `${cupCount} copas · ${cupPlayed}/${cupTotal} resultados`
                : "1º→Oro · 2º→Plata · 3º→Bronce · 4º→Madera"
            }
          >
            {allGroupPlayed && cupPlayed === 0 && (
              <ActionButton
                action={generateCupsAction}
                variant="primary"
                confirm={cupCount > 0 ? "Regenera las 4 llaves. ¿Seguir?" : undefined}
              >
                {cupCount > 0 ? "Regenerar copas" : "Generar copas"}
              </ActionButton>
            )}
            {!allGroupPlayed && hasFixture && (
              <p className="text-xs text-ink-faint">Cargá todos los resultados de grupos primero.</p>
            )}
          </Step>

          <Step
            n={6}
            title="Torneo finalizado"
            done={s === "FINISHED"}
            detail={
              s === "FINISHED"
                ? "campeón, subcampeón y 3er puesto de cada copa — se finalizó solo al cargar la última final"
                : cupTotal > 0
                  ? `${cupPlayed}/${cupTotal} resultados de copas — se finaliza solo al cargar la última final`
                  : "generá las copas primero"
            }
          >
            {s === "FINISHED" && (
              <ActionButton
                action={reopenFromFinished}
                variant="ghost"
                confirm="¿Reabrir para corregir un resultado de copas?"
              >
                Reabrir (corregir resultado)
              </ActionButton>
            )}
          </Step>
        </ol>
      </Card>

      {cups.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-paper">
            {s === "FINISHED" ? "Resultados finales" : "Podio (provisorio)"}
          </h2>
          <TournamentPodium cups={cups} />
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        {hasFixture && (
          <Link
            href="/admin/torneo/resultados"
            className="inline-flex items-center gap-2 rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-bg-deep hover:bg-white"
          >
            Resultados de grupos ({playedCount}/{groupMatchCount})
          </Link>
        )}
        {cupCount > 0 && (
          <Link
            href="/admin/torneo/copas"
            className="inline-flex items-center gap-2 rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-bg-deep hover:bg-white"
          >
            Resultados de copas ({cupPlayed}/{cupTotal})
          </Link>
        )}
      </div>

      {groups.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-xl font-semibold text-paper">Grupos y posiciones</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <StandingsTable key={g.id} group={g} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  detail,
  done,
  children,
}: {
  n: number;
  title: string;
  detail: string;
  done: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border font-mono text-xs ${
          done ? "border-ok bg-ok/15 text-ok" : "border-line text-ink-faint"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="flex-1">
        <p className="font-semibold text-ink">{title}</p>
        <p className="text-xs text-ink-faint">{detail}</p>
        {children && <div className="mt-2">{children}</div>}
      </div>
    </li>
  );
}
