import Link from "next/link";
import { getActiveTournament } from "@/lib/tournament/queries";
import { getConfirmedTeams } from "@/lib/services/groups";
import { db } from "@/lib/db";
import { GroupEditor } from "./group-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Armar grupos", robots: { index: false } };

export default async function GruposPage() {
  const tournament = await getActiveTournament();
  const [confirmed, groups] = await Promise.all([
    getConfirmedTeams(tournament.id),
    db.group.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { order: "asc" },
      include: { groupTeams: { select: { teamId: true } } },
    }),
  ]);

  const currentAssignment = new Map<string, number>();
  groups.forEach((g, i) => g.groupTeams.forEach((gt) => currentAssignment.set(gt.teamId, i)));

  const editable =
    tournament.status === "REGISTRATION_CLOSED" || tournament.status === "GROUPS_PUBLISHED";
  const hasResults =
    (await db.match.count({
      where: { tournamentId: tournament.id, phase: "GROUP", status: { in: ["FINISHED", "WALKOVER"] } },
    })) > 0;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/torneo" className="text-sm text-accent">
        ← Torneo
      </Link>
      <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
        Armar grupos a mano
      </h1>

      {!editable ? (
        <p className="rounded-2xl border border-line border-l-[3px] border-l-warn bg-surface p-4 text-sm text-ink-soft">
          Solo se pueden editar grupos con la inscripción cerrada y antes de que empiece el torneo.
        </p>
      ) : hasResults ? (
        <p className="rounded-2xl border border-line border-l-[3px] border-l-danger bg-surface p-4 text-sm text-ink-soft">
          Ya hay resultados cargados: no se pueden rearmar los grupos.
        </p>
      ) : (
        <GroupEditor
          teams={confirmed.map((t) => ({ id: t.id, name: t.name, seed: t.seed }))}
          groupCount={tournament.config!.groupCount}
          groupSize={tournament.config!.groupSize}
          initialAssignment={Object.fromEntries(currentAssignment)}
        />
      )}
    </div>
  );
}
