import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicTeamRoster } from "@/lib/tournament/team-view";
import { ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await getPublicTeamRoster(id);
  return { title: team?.name ?? "Equipo", robots: { index: false } };
}

export default async function EquipoPublicoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const team = await getPublicTeamRoster(id);
  if (!team) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
      <ButtonLink href="/torneo" variant="ghost" size="sm" className="-ml-2">
        ← Volver al torneo
      </ButtonLink>

      <div className="mt-6 flex flex-col items-center gap-3 rounded-card border border-line-soft bg-surface px-6 py-10 text-center">
        <span className="text-6xl leading-none" role="img" aria-label={`Bandera de ${team.name}`}>
          {team.flag}
        </span>
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper sm:text-4xl">
          {team.name}
        </h1>
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
          {team.players.length} {team.players.length === 1 ? "integrante" : "integrantes"}
        </span>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-line-soft bg-surface">
        {team.players.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">
            Todavía no cargaron el plantel.
          </p>
        ) : (
          <ol className="divide-y divide-line-soft">
            {team.players.map((p, i) => (
              <li key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="w-6 flex-none text-right font-mono text-xs text-ink-faint">
                  {i + 1}
                </span>
                <span className="text-sm text-ink">
                  {p.firstName} <span className="font-medium text-paper">{p.lastName}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
