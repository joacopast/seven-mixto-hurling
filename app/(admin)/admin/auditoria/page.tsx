import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { Badge } from "@/components/ui";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auditoría", robots: { index: false } };

const ACTION_LABEL: Record<string, string> = {
  "registration.create": "Inscripción creada",
  "registration.requote": "Recotización",
  "registration.status.change": "Cambio de estado",
  "waitlist.join": "Sumado a lista de espera",
  "waitlist.promote": "Promovido de lista de espera",
  "waitlist.expire": "Invitación vencida",
  "payment.checkout.start": "Checkout iniciado",
  "payment.approved": "Pago aprobado",
  "payment.rejected": "Pago rechazado",
  "payment.refunded": "Pago devuelto",
  "payment.amount.mismatch": "Monto no coincide",
  "payment.overbooked": "Sobrecupo",
  "groups.assign": "Grupos asignados",
  "groups.fixture.generate": "Fixture generado",
  "tournament.status": "Estado del torneo",
  "match.result.set": "Resultado de grupo",
  "cups.generate": "Copas generadas",
  "cup.match.result.set": "Resultado de copa",
  "config.update": "Configuración actualizada",
  "team.admin.create": "Equipo creado (admin)",
  "team.admin.update": "Equipo editado (admin)",
  "team.admin.delete": "Equipo eliminado (admin)",
  "player.admin.add": "Jugador agregado (admin)",
  "player.admin.remove": "Jugador quitado (admin)",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string; page?: string }>;
}) {
  const { entity, action, page } = await searchParams;
  const tournament = await getActiveTournament();
  const pageNum = Math.max(1, Number(page) || 1);
  const perPage = 50;

  const where: Prisma.AuditLogWhereInput = { tournamentId: tournament.id };
  if (entity) where.entity = entity;
  if (action) where.action = action;

  const [logs, total, actions] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * perPage,
      take: perPage,
      include: { user: { select: { email: true } } },
    }),
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where: { tournamentId: tournament.id },
      distinct: ["action"],
      select: { action: true },
    }),
  ]);

  const pages = Math.ceil(total / perPage);
  const qs = (o: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    if (entity) p.set("entity", entity);
    if (action) p.set("action", action);
    for (const [k, v] of Object.entries(o)) if (v != null) p.set(k, String(v));
    return `?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
          Auditoría <span className="text-ink-faint">({total})</span>
        </h1>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link
          href="/admin/auditoria"
          className={`rounded-full px-3 py-1 ${!action && !entity ? "bg-accent-wash text-accent" : "text-ink-soft"}`}
        >
          Todo
        </Link>
        {["Team", "Registration", "Match", "Payment", "TournamentConfig", "Tournament"].map((e) => (
          <Link
            key={e}
            href={`?entity=${e}`}
            className={`rounded-full px-3 py-1 ${entity === e ? "bg-accent-wash text-accent" : "text-ink-soft"}`}
          >
            {e}
          </Link>
        ))}
        {actions.slice(0, 8).map((a) => (
          <Link
            key={a.action}
            href={`?action=${a.action}`}
            className={`rounded-full border border-line px-3 py-1 ${action === a.action ? "border-accent text-accent" : "text-ink-faint"}`}
          >
            {ACTION_LABEL[a.action] ?? a.action}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card border border-line-soft">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Quién</th>
              <th className="px-3 py-2">Acción</th>
              <th className="px-3 py-2">Entidad</th>
              <th className="px-3 py-2">Cambio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-faint">
                  Sin registros.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 font-mono text-xs text-ink-faint">
                  {l.createdAt.toLocaleString("es-AR")}
                </td>
                <td className="px-3 py-2 text-xs text-ink-soft">{l.user?.email ?? "sistema"}</td>
                <td className="px-3 py-2">
                  <Badge tone="neutral">{ACTION_LABEL[l.action] ?? l.action}</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-faint">
                  {l.entity}
                  <span className="opacity-60"> · {l.entityId.slice(0, 8)}</span>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-ink-soft">
                  {l.previousValue != null && (
                    <span className="text-danger/80">{JSON.stringify(l.previousValue).slice(0, 90)}</span>
                  )}
                  {l.newValue != null && (
                    <span className="text-ok/80"> → {JSON.stringify(l.newValue).slice(0, 90)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {pageNum > 1 && (
            <Link href={qs({ page: pageNum - 1 })} className="text-accent">
              ← Anterior
            </Link>
          )}
          <span className="text-ink-faint">
            Página {pageNum} de {pages}
          </span>
          {pageNum < pages && (
            <Link href={qs({ page: pageNum + 1 })} className="text-accent">
              Siguiente →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
