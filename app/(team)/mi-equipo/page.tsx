import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { getActiveTournament } from "@/lib/tournament/queries";
import { formatArs } from "@/lib/tournament/pricing";
import {
  REGISTRATION_STATUS_LABEL,
  REGISTRATION_STATUS_TONE,
} from "@/lib/tournament/status";
import { Card, Badge, ButtonLink } from "@/components/ui";

export const metadata = { title: "Mi equipo", robots: { index: false } };

export default async function MiEquipoPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const user = await requireUser("/mi-equipo");
  const tournament = await getActiveTournament();
  const { team: teamParam } = await searchParams;

  const teams = await db.team.findMany({
    where: { managerUserId: user.id, tournamentId: tournament.id },
    orderBy: { createdAt: "asc" },
    include: {
      registration: true,
      players: { orderBy: { createdAt: "asc" } },
      _count: { select: { players: true } },
    },
  });

  if (teams.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">Todavía no tenés un equipo</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
          Iniciá la inscripción para registrar tu equipo, cargar tu plantel y pagar.
        </p>
        <ButtonLink href="/inscripcion" className="mt-6">
          Inscribir un equipo
        </ButtonLink>
      </div>
    );
  }

  const active = teams.find((t) => t.id === teamParam) ?? teams[0]!;

  return (
    <div className="flex flex-col gap-6">
      {teams.length > 1 && (
        <nav className="flex flex-wrap gap-2">
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/mi-equipo?team=${t.id}`}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                t.id === active.id
                  ? "border-accent bg-accent-wash text-accent"
                  : "border-line text-ink-soft hover:bg-surface-2"
              }`}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">{active.name}</h1>
          {active.clubTag && <p className="text-sm text-ink-faint">{active.clubTag}</p>}
        </div>
        <Badge tone={REGISTRATION_STATUS_TONE[active.registrationStatus]}>
          {REGISTRATION_STATUS_LABEL[active.registrationStatus]}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="font-mono text-xs uppercase tracking-wide text-ink-faint">Jugadores</div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">
            {active._count.players}
          </div>
        </Card>
        <Card>
          <div className="font-mono text-xs uppercase tracking-wide text-ink-faint">Total inscripción</div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">
            {active.registration ? formatArs(active.registration.totalAmount) : "—"}
          </div>
        </Card>
        <Card>
          <div className="font-mono text-xs uppercase tracking-wide text-ink-faint">Grupo / Copa</div>
          <div className="mt-1 font-display text-2xl font-semibold text-ink">Por definir</div>
        </Card>
      </div>

      {["PENDING_PAYMENT", "PAYMENT_STARTED", "PAYMENT_REJECTED"].includes(
        active.registrationStatus,
      ) &&
        active.registration && (
          <Card className="border-l-[3px] border-l-warn">
            <p className="font-semibold text-paper">Falta completar el pago</p>
            <p className="mt-1 text-sm text-ink-soft">
              Tu equipo queda confirmado automáticamente cuando se acredita el pago de{" "}
              {formatArs(active.registration.totalAmount)}.
            </p>
            <ButtonLink href={`/inscripcion/pago/${active.registration.id}`} className="mt-4">
              Ir al pago
            </ButtonLink>
          </Card>
        )}

      {active.registrationStatus === "OBSERVED" && (
        <Card className="border-l-[3px] border-l-danger">
          <p className="font-semibold text-paper">Inscripción en revisión</p>
          <p className="mt-1 text-sm text-ink-soft">
            La organización está revisando tu pago. Te vamos a contactar por email.
          </p>
        </Card>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">Plantel</h2>
          <span className="font-mono text-sm text-ink-faint">{active.players.length} jugadores</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              <tr>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Género</th>
                <th className="px-3 py-2">#</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {active.players.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-ink">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-soft">
                    {p.docType} {p.docNumber}
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{p.gender}</td>
                  <td className="px-3 py-2 font-mono text-ink-soft">{p.shirtNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-faint">
          La edición del plantel desde el portal se habilita en la próxima etapa. Por ahora, para
          cambios escribinos.
        </p>
      </section>
    </div>
  );
}
