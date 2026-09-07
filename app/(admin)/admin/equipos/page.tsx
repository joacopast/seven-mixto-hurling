import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { formatArs } from "@/lib/tournament/pricing";
import { REGISTRATION_STATUS_LABEL, REGISTRATION_STATUS_TONE } from "@/lib/tournament/status";
import { Badge, Input } from "@/components/ui";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Equipos", robots: { index: false } };

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const tournament = await getActiveTournament();

  const where: Prisma.TeamWhereInput = { tournamentId: tournament.id };
  if (q && q.trim()) {
    const term = q.trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { contactName: { contains: term, mode: "insensitive" } },
      { contactEmail: { contains: term, mode: "insensitive" } },
      { contactPhone: { contains: term, mode: "insensitive" } },
    ];
  }

  const teams = await db.team.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { registration: true, _count: { select: { players: true } } },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold text-ink">
          Equipos <span className="text-ink-faint">({teams.length})</span>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/equipos/nuevo"
            className="rounded-full bg-paper px-4 py-2 text-sm font-semibold text-bg-deep"
          >
            Crear equipo
          </Link>
          <a
            href="/api/admin/export/teams"
            download
            className="rounded-full border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Equipos CSV
          </a>
          <a
            href="/api/admin/export/players"
            download
            className="rounded-full border border-line px-3 py-2 text-sm text-ink-soft hover:bg-surface-2"
          >
            Jugadores CSV
          </a>
        </div>
      </div>

      <form className="max-w-sm">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre, responsable, email o teléfono"
        />
      </form>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">Equipo</th>
              <th className="px-3 py-2">Responsable</th>
              <th className="px-3 py-2">Jug.</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {teams.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-faint">
                  Sin resultados.
                </td>
              </tr>
            )}
            {teams.map((t) => (
              <tr key={t.id} className="hover:bg-surface-2/50">
                <td className="px-3 py-2">
                  <Link href={`/admin/equipos/${t.id}`} className="font-medium text-accent">
                    {t.name}
                  </Link>
                  {t.clubTag && <span className="ml-2 text-xs text-ink-faint">{t.clubTag}</span>}
                </td>
                <td className="px-3 py-2 text-ink-soft">
                  <div>{t.contactName}</div>
                  <div className="font-mono text-xs text-ink-faint">{t.contactEmail}</div>
                </td>
                <td className="px-3 py-2 font-mono text-ink-soft">{t._count.players}</td>
                <td className="px-3 py-2 font-mono text-ink-soft">
                  {t.registration ? formatArs(t.registration.totalAmount) : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={REGISTRATION_STATUS_TONE[t.registrationStatus]}>
                    {REGISTRATION_STATUS_LABEL[t.registrationStatus]}
                  </Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-faint">
                  {t.createdAt.toLocaleDateString("es-AR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
