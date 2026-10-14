import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { formatArs } from "@/lib/tournament/pricing";
import { normalizePhone } from "@/lib/tournament/whatsapp";
import { Badge, Card } from "@/components/ui";
import { mercadoPagoConfigured } from "@/lib/payments/mercadopago";
import { PendingPaymentRow } from "./pending-row";
import type { PaymentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagos", robots: { index: false } };

const STATUS_TONE: Record<PaymentStatus, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  APPROVED: "ok",
  PENDING: "warn",
  IN_PROCESS: "info",
  REJECTED: "danger",
  REFUNDED: "danger",
  CANCELLED: "neutral",
};

const PROVIDER_LABEL: Record<string, string> = {
  MANUAL_TRANSFER: "Transferencia",
  MERCADOPAGO: "Mercado Pago",
};

const PENDING_STATUSES = ["PENDING_PAYMENT", "PAYMENT_REJECTED", "OBSERVED"] as const;

export default async function AdminPagosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const tournament = await getActiveTournament();
  const config = tournament.config!;
  const isManual = config.paymentMethod === "MANUAL_TRANSFER";

  const [payments, byStatus, events, pendingTeams] = await Promise.all([
    db.payment.findMany({
      where: {
        registration: { tournamentId: tournament.id },
        ...(status ? { status: status as PaymentStatus } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { registration: { include: { team: { select: { id: true, name: true } } } } },
    }),
    db.payment.groupBy({
      by: ["status"],
      where: { registration: { tournamentId: tournament.id } },
      _count: true,
      _sum: { amount: true },
    }),
    isManual
      ? Promise.resolve([])
      : db.webhookEvent.findMany({
          where: { provider: "mercadopago" },
          orderBy: { receivedAt: "desc" },
          take: 15,
        }),
    db.team.findMany({
      where: { tournamentId: tournament.id, registrationStatus: { in: [...PENDING_STATUSES] } },
      orderBy: { createdAt: "asc" },
      include: { registration: true },
    }),
  ]);

  const approved = byStatus.find((s) => s.status === "APPROVED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
          Pagos
        </h1>
        <Badge tone="accent">
          {isManual ? "Transferencia bancaria" : "Mercado Pago"}
        </Badge>
        {!isManual && (
          <Badge tone={mercadoPagoConfigured() ? "ok" : "warn"}>
            {mercadoPagoConfigured() ? "configurado" : "sin credenciales"}
          </Badge>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            Recaudado (aprobado)
          </div>
          <div className="mt-2 font-display text-2xl font-semibold text-paper">
            {formatArs(approved?._sum.amount ?? 0)}
          </div>
        </Card>
        {(["APPROVED", "PENDING", "REJECTED"] as PaymentStatus[]).map((s) => {
          const row = byStatus.find((b) => b.status === s);
          return (
            <Card key={s}>
              <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">{s}</div>
              <div className="mt-2 font-display text-2xl font-semibold text-paper">
                {row?._count ?? 0}
              </div>
            </Card>
          );
        })}
      </div>

      {isManual && (
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold text-paper">
            Pendientes de confirmar ({pendingTeams.length})
          </h2>
          <p className="mb-3 text-sm text-ink-soft">
            Estos equipos todavía no transfirieron o están esperando que confirmes el comprobante
            que mandaron por WhatsApp.
          </p>
          <div className="overflow-x-auto rounded-card border border-line-soft">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-3 py-2">Equipo</th>
                  <th className="px-3 py-2">Monto</th>
                  <th className="px-3 py-2">WhatsApp</th>
                  <th className="px-3 py-2">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {pendingTeams.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-ink-faint">
                      No hay equipos esperando confirmación.
                    </td>
                  </tr>
                )}
                {pendingTeams.map((t) =>
                  t.registration ? (
                    <PendingPaymentRow
                      key={t.id}
                      registrationId={t.registration.id}
                      teamName={t.name}
                      amountLabel={formatArs(t.registration.totalAmount)}
                      whatsappLink={
                        t.contactPhone ? `https://wa.me/${normalizePhone(t.contactPhone)}` : null
                      }
                    />
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex gap-2 text-sm">
        <Link
          href="/admin/pagos"
          className={`rounded-full px-3 py-1 ${!status ? "bg-accent-wash text-accent" : "text-ink-soft"}`}
        >
          Todos
        </Link>
        {(["APPROVED", "PENDING", "REJECTED", "REFUNDED"] as PaymentStatus[]).map((s) => (
          <Link
            key={s}
            href={`/admin/pagos?status=${s}`}
            className={`rounded-full px-3 py-1 ${status === s ? "bg-accent-wash text-accent" : "text-ink-soft"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-card border border-line-soft">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
            <tr>
              <th className="px-3 py-2">Equipo</th>
              <th className="px-3 py-2">Medio</th>
              <th className="px-3 py-2">Monto</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Referencia</th>
              <th className="px-3 py-2">Fecha</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-faint">
                  Sin pagos.
                </td>
              </tr>
            )}
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">
                  {p.registration?.team ? (
                    <Link
                      href={`/admin/equipos/${p.registration.team.id}`}
                      className="text-accent"
                    >
                      {p.registration.team.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-ink-soft">
                  {PROVIDER_LABEL[p.provider] ?? p.provider}
                </td>
                <td className="px-3 py-2 font-mono text-ink-soft">{formatArs(p.amount)}</td>
                <td className="px-3 py-2">
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-faint">
                  {p.mpPaymentId ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-faint">
                  {p.createdAt.toLocaleString("es-AR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isManual && (
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold text-paper">
            Webhooks recientes de Mercado Pago
          </h2>
          <ul className="space-y-1.5 text-sm">
            {events.length === 0 && <li className="text-ink-faint">Sin eventos.</li>}
            {events.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-x-3 rounded-2xl border border-line-soft bg-surface px-3 py-2"
              >
                <Badge
                  tone={
                    e.status === "PROCESSED"
                      ? "ok"
                      : e.status === "ERROR"
                        ? "danger"
                        : e.status === "IGNORED"
                          ? "neutral"
                          : "warn"
                  }
                >
                  {e.status}
                </Badge>
                <span className="font-mono text-xs text-ink-soft">
                  {e.topic} · {e.resourceId}
                </span>
                <span className="font-mono text-xs text-ink-faint">
                  {e.receivedAt.toLocaleString("es-AR")}
                </span>
                {e.error && <span className="text-xs text-danger">{e.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
