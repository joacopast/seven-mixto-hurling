import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { getGroupsWithStandings } from "@/lib/tournament/groups-view";
import { getConfirmedTeams } from "@/lib/services/groups";
import { Card, Badge } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { StandingsTable } from "@/components/standings-table";
import {
  closeRegistration,
  reopenRegistration,
  autoDrawGroups,
  generateFixture,
  publishGroups,
  startGroupPhase,
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
  const [confirmed, groups, groupMatchCount, playedCount] = await Promise.all([
    getConfirmedTeams(tournament.id),
    getGroupsWithStandings(tournament.id),
    db.match.count({ where: { tournamentId: tournament.id, phase: "GROUP" } }),
    db.match.count({
      where: { tournamentId: tournament.id, phase: "GROUP", status: { in: ["FINISHED", "WALKOVER"] } },
    }),
  ]);

  const s = tournament.status;
  const hasFixture = groupMatchCount > 0;

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
            title="Publicar"
            done={["GROUPS_PUBLISHED", "GROUPS_IN_PROGRESS", "CUPS_PUBLISHED", "CUPS_IN_PROGRESS", "FINISHED"].includes(s)}
            detail="visible en /torneo"
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
        </ol>
      </Card>

      {hasFixture && (
        <Link
          href="/admin/torneo/resultados"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-paper px-5 py-2.5 text-sm font-semibold text-bg-deep"
        >
          Cargar resultados ({playedCount}/{groupMatchCount})
        </Link>
      )}

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
