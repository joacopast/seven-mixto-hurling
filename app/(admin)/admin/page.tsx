import { db } from "@/lib/db";
import { getActiveTournament, getCapacity } from "@/lib/tournament/queries";
import { formatArs } from "@/lib/tournament/pricing";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament/status";
import { Card } from "@/components/ui";
import type { RegistrationStatus } from "@prisma/client";

export const metadata = { title: "Panel", robots: { index: false } };

export default async function AdminDashboard() {
  const tournament = await getActiveTournament();
  const capacity = await getCapacity();

  const [byStatus, playerCount, revenue, drafts, depositsOwed, depositsPaid] = await Promise.all([
    db.team.groupBy({
      by: ["registrationStatus"],
      where: { tournamentId: tournament.id },
      _count: true,
    }),
    db.player.count({ where: { tournamentId: tournament.id } }),
    db.registration.aggregate({
      where: {
        tournamentId: tournament.id,
        status: { in: ["PAYMENT_APPROVED", "CONFIRMED"] },
      },
      _sum: { totalAmount: true },
    }),
    db.registration.aggregate({
      where: { tournamentId: tournament.id, status: "PENDING_PAYMENT" },
      _sum: { totalAmount: true },
    }),
    db.registration.aggregate({
      where: { tournamentId: tournament.id, status: "DEPOSIT_PAID" },
      _sum: { totalAmount: true },
    }),
    db.payment.aggregate({
      where: { registration: { tournamentId: tournament.id, status: "DEPOSIT_PAID" }, status: "APPROVED" },
      _sum: { amount: true },
    }),
  ]);
  const depositsOwedTotal = Math.max(0, (depositsOwed._sum.totalAmount ?? 0) - (depositsPaid._sum.amount ?? 0));

  const statusMap = new Map<RegistrationStatus, number>();
  for (const row of byStatus) statusMap.set(row.registrationStatus, row._count);

  const tiles = [
    { label: "Equipos inscriptos", value: capacity.occupying },
    { label: "Confirmados", value: capacity.confirmed },
    { label: "Pendientes de pago", value: statusMap.get("PENDING_PAYMENT") ?? 0 },
    { label: "Con seña pagada", value: statusMap.get("DEPOSIT_PAID") ?? 0 },
    { label: "Cupos disponibles", value: capacity.available },
    { label: "Lista de espera", value: capacity.waitlistCount },
    { label: "Jugadores cargados", value: playerCount },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-semibold text-ink">{tournament.name}</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Estado: {tournament.status} · {tournament.edition}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label}>
            <div className="font-mono text-[11px] uppercase leading-tight tracking-wide text-ink-faint">
              {t.label}
            </div>
            <div className="mt-2 font-display text-3xl font-semibold text-ink">{t.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">Ingresos</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Confirmado (pagos aprobados)</dt>
              <dd className="font-mono font-semibold">{formatArs(revenue._sum.totalAmount ?? 0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Proyectado (pendiente de pago)</dt>
              <dd className="font-mono">{formatArs(drafts._sum.totalAmount ?? 0)}</dd>
            </div>
            {depositsOwedTotal > 0 && (
              <div className="flex justify-between">
                <dt className="text-ink-soft">Falta de señas por reclamar</dt>
                <dd className="font-mono font-semibold text-warn">{formatArs(depositsOwedTotal)}</dd>
              </div>
            )}
          </dl>
        </Card>

        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">Inscripciones por estado</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {byStatus.length === 0 && <li className="text-ink-faint">Sin inscripciones todavía.</li>}
            {byStatus.map((row) => (
              <li key={row.registrationStatus} className="flex justify-between">
                <span className="text-ink-soft">
                  {REGISTRATION_STATUS_LABEL[row.registrationStatus]}
                </span>
                <span className="font-mono">{row._count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
