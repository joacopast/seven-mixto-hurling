import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatArs } from "@/lib/tournament/pricing";
import { ageOn } from "@/lib/tournament/roster";
import { REGISTRATION_STATUS_LABEL, REGISTRATION_STATUS_TONE } from "@/lib/tournament/status";
import { Badge, Card } from "@/components/ui";
import { StatusChanger } from "./status-changer";
import {
  TeamEditForm,
  AddPlayerForm,
  RemovePlayerButton,
  DeleteTeamButton,
  ConfirmPaymentButton,
} from "./team-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Equipo", robots: { index: false } };

export default async function AdminTeamDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await db.team.findUnique({
    where: { id },
    include: {
      registration: { include: { payments: true } },
      players: { orderBy: { createdAt: "asc" } },
      manager: true,
      tournament: true,
    },
  });
  if (!team) notFound();
  const ageReference = team.tournament.startDate ?? new Date();
  const amountPaid =
    team.registration?.payments
      .filter((p) => p.status === "APPROVED")
      .reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const amountOwed = Math.max(0, (team.registration?.totalAmount ?? 0) - amountPaid);

  const takenTeams = await db.team.findMany({
    where: { tournamentId: team.tournamentId, registrationStatus: { not: "CANCELLED" }, NOT: { id: team.id } },
    select: { name: true },
  });

  const audit = await db.auditLog.findMany({
    where: { entity: { in: ["Team", "Registration"] }, entityId: { in: [team.id, team.registration?.id ?? ""] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { user: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/equipos" className="text-sm text-accent">
        ← Equipos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">{team.name}</h1>
          <p className="mt-1 font-mono text-xs text-ink-faint">
            {team.slug} · alta {team.createdAt.toLocaleString("es-AR")}
          </p>
        </div>
        <Badge tone={REGISTRATION_STATUS_TONE[team.registrationStatus]}>
          {REGISTRATION_STATUS_LABEL[team.registrationStatus]}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">Responsable</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Item label="Nombre" value={team.contactName} />
            <Item label="Email" value={team.contactEmail} />
            <Item label="Teléfono" value={team.contactPhone} />
          </dl>
        </Card>
        <Card>
          <h2 className="font-display text-lg font-semibold text-ink">Inscripción</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Item label="Total" value={team.registration ? formatArs(team.registration.totalAmount) : "—"} />
            {amountPaid > 0 && (
              <>
                <Item label="Pagado" value={formatArs(amountPaid)} />
                {amountOwed > 0 && <Item label="Falta" value={formatArs(amountOwed)} />}
              </>
            )}
            <Item label="Tarifa" value={team.registration?.priceTier ?? "—"} />
            <Item label="Jugadores cotizados" value={String(team.registration?.playerCountQuoted ?? 0)} />
            <Item
              label="Cotizado"
              value={team.registration?.quotedAt?.toLocaleString("es-AR") ?? "—"}
            />
          </dl>
          {team.registration && team.registration.payments.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-soft">
              {team.registration.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>
                    {p.provider === "MANUAL_TRANSFER" ? "Transferencia" : "Mercado Pago"} ·{" "}
                    {p.approvedAt?.toLocaleString("es-AR") ?? p.createdAt.toLocaleString("es-AR")}
                  </span>
                  <span className="font-mono">{formatArs(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {team.registration &&
        !["CONFIRMED", "PAYMENT_APPROVED", "CANCELLED"].includes(team.registrationStatus) && (
          <ConfirmPaymentButton
            registrationId={team.registration.id}
            teamId={team.id}
            owedPesos={Math.round(amountOwed / 100)}
          />
        )}

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">Editar equipo</h2>
        <div className="mt-4">
          <TeamEditForm
            team={{
              id: team.id,
              name: team.name,
              contactName: team.contactName,
              contactEmail: team.contactEmail,
              contactPhone: team.contactPhone,
              seed: team.seed,
              adminNotes: team.adminNotes,
            }}
            takenCountries={takenTeams.map((t) => t.name)}
          />
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold text-ink">Cambiar estado de inscripción</h2>
        <p className="mt-1 text-sm text-ink-soft">Queda registrado en el audit log.</p>
        <div className="mt-4">
          <StatusChanger teamId={team.id} current={team.registrationStatus} />
        </div>
      </Card>

      <section>
        <h2 className="mb-2 font-display text-xl font-semibold text-ink">
          Plantel ({team.players.length})
          {" · "}
          {team.players.filter((p) => p.playsHockey).length} jugadores
          {team.players.some((p) => !p.playsHockey) &&
            ` · ${team.players.filter((p) => !p.playsHockey).length} no jugadores`}
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Edad</th>
                <th className="px-3 py-2">Género</th>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Nivel</th>
                <th className="px-3 py-2">Dieta</th>
                <th className="px-3 py-2">Fiesta</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {team.players.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-ink">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">
                    {p.docType} {p.docNumber}
                  </td>
                  <td className="px-3 py-2 font-mono text-ink-soft">{ageOn(p.birthDate, ageReference)}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.gender}</td>
                  <td className="px-3 py-2 font-mono text-ink-soft">{p.shirtNumber ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.playsHockey ? (
                      <Badge tone="ok">Jugador</Badge>
                    ) : (
                      <Badge tone="neutral">No jugador</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">{p.dietaryRestriction ?? "—"}</td>
                  <td className="px-3 py-2">
                    {p.attendsParty ? (
                      <Badge tone="ok">Sí</Badge>
                    ) : (
                      <Badge tone="neutral">No</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <RemovePlayerButton playerId={p.id} teamId={team.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <AddPlayerForm teamId={team.id} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-display text-xl font-semibold text-ink">Historial</h2>
        <ul className="space-y-2 text-sm">
          {audit.length === 0 && <li className="text-ink-faint">Sin registros.</li>}
          {audit.map((log) => (
            <li key={log.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <span className="font-mono text-xs text-ink-faint">
                {log.createdAt.toLocaleString("es-AR")} ·{" "}
                {log.user?.email ?? "sistema"}
              </span>
              <span className="ml-2 text-ink-soft">{log.action}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="border-t border-line pt-6">
        <DeleteTeamButton teamId={team.id} />
        <p className="mt-2 text-xs text-ink-faint">
          Si el equipo ya tiene partidos asignados, cancelalo cambiando su estado en vez de
          eliminarlo.
        </p>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
