import Link from "next/link";
import { getActiveTournament, getCapacity } from "@/lib/tournament/queries";
import { getWaitlist } from "@/lib/services/waitlist";
import { Badge, Card } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { promoteEntry, runAutoPromote } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lista de espera", robots: { index: false } };

export default async function EsperaPage() {
  const tournament = await getActiveTournament();
  const [rows, capacity] = await Promise.all([getWaitlist(tournament.id), getCapacity()]);

  const waiting = rows.filter((r) => r.status === "WAITLISTED");
  const invited = rows.filter((r) => r.status !== "WAITLISTED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper">
          Lista de espera
        </h1>
        <ActionButton action={runAutoPromote}>Correr promoción automática</ActionButton>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">Cupos libres</div>
          <div className="mt-1 font-display text-2xl font-semibold text-paper">{capacity.available}</div>
        </Card>
        <Card>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">En espera</div>
          <div className="mt-1 font-display text-2xl font-semibold text-paper">{waiting.length}</div>
        </Card>
        <Card>
          <div className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">Invitados (pagando)</div>
          <div className="mt-1 font-display text-2xl font-semibold text-paper">{invited.length}</div>
        </Card>
      </div>

      {invited.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-lg font-semibold text-paper">Invitados con ventana de pago</h2>
          <div className="overflow-x-auto rounded-card border border-line-soft">
            <table className="w-full min-w-[36rem] text-sm">
              <tbody className="divide-y divide-line-soft">
                {invited.map((r) => (
                  <tr key={r.registrationId}>
                    <td className="px-3 py-2">
                      <Link href={`/admin/equipos/${r.teamId}`} className="font-medium text-accent">
                        {r.teamName}
                      </Link>
                      <span className="ml-2 text-xs text-ink-faint">{r.contactEmail}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-soft">
                      Vence {r.expiresAt?.toLocaleString("es-AR") ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === "CONFIRMED" ? "ok" : "warn"}>{r.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-display text-lg font-semibold text-paper">
          En espera ({waiting.length})
        </h2>
        <div className="overflow-x-auto rounded-card border border-line-soft">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Equipo</th>
                <th className="px-3 py-2">Contacto</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {waiting.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-ink-faint">
                    Nadie en lista de espera.
                  </td>
                </tr>
              )}
              {waiting.map((r) => (
                <tr key={r.registrationId}>
                  <td className="px-3 py-2 font-mono text-ink-faint">{r.position ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/equipos/${r.teamId}`} className="font-medium text-accent">
                      {r.teamName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {r.contactName} · {r.contactEmail}
                  </td>
                  <td className="px-3 py-2">
                    <ActionButton
                      action={promoteEntry.bind(null, r.registrationId)}
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                    >
                      Invitar
                    </ActionButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
