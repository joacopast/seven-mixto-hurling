import { getActiveTournament } from "@/lib/tournament/queries";
import { formatArs } from "@/lib/tournament/pricing";
import { Card, Callout } from "@/components/ui";

export const metadata = { title: "Configuración", robots: { index: false } };

export default async function AdminConfigPage() {
  const tournament = await getActiveTournament();
  const c = tournament.config!;

  const groups: { title: string; rows: [string, string][] }[] = [
    {
      title: "Estructura",
      rows: [
        ["Equipos máximos", String(c.maxTeams)],
        ["Grupos", `${c.groupCount} de ${c.groupSize}`],
        ["Copas", c.cupNames.join(" · ")],
        ["Asignación de copas", c.cupAssignmentStrategy],
        ["Partido por 3er puesto", c.thirdPlaceMatch ? "Sí" : "No"],
      ],
    },
    {
      title: "Partidos y canchas",
      rows: [
        ["Duración del partido", `${c.matchDurationMin} min`],
        ["Canchas", String(c.fieldCount)],
        ["Recambio entre tandas", `${c.turnoverMin} min`],
        ["Definición por empate", c.drawResolution],
      ],
    },
    {
      title: "Puntos y desempates",
      rows: [
        ["Victoria / empate / derrota", `${c.pointsWin} / ${c.pointsDraw} / ${c.pointsLoss}`],
        ["Walkover", `${c.pointsWalkover} pts · ${c.walkoverScore}`],
        ["Criterios de desempate", c.tiebreakers.join(" → ")],
      ],
    },
    {
      title: "Plantel",
      rows: [
        ["Jugadores", `${c.minPlayers} a ${c.maxPlayers}`],
        ["En cancha", `${c.playersOnField} (máx. ${c.maxMenOnField} hombres)`],
        ["Edad mínima", `${c.minPlayerAge} años`],
      ],
    },
    {
      title: "Precios",
      rows: [
        ["Jugadores incluidos", String(c.basePlayers)],
        ["Tarifa temprana", formatArs(c.earlyPrice)],
        ["Tarifa general", formatArs(c.latePrice)],
        ["Jugador adicional", formatArs(c.extraPlayerPrice)],
        ["Cambio de precio", c.priceChangeAt.toLocaleString("es-AR")],
        ["Recargo medio de pago", `${(c.paymentSurchargeBp / 100).toFixed(2)}%`],
      ],
    },
    {
      title: "Fechas",
      rows: [
        ["Inscripción abre", c.registrationOpensAt?.toLocaleString("es-AR") ?? "—"],
        ["Inscripción cierra", c.registrationClosesAt?.toLocaleString("es-AR") ?? "—"],
        ["Cierre de edición de equipo", c.teamEditLockAt?.toLocaleString("es-AR") ?? "—"],
        ["Cierre de edición de plantel", c.rosterLockAt?.toLocaleString("es-AR") ?? "—"],
        ["Ventana de pago lista de espera", `${c.waitlistPaymentWindowHours} h`],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl font-semibold text-ink">Configuración del torneo</h1>
      <Callout tone="info" title="Solo lectura por ahora">
        La edición de la configuración desde el panel llega en la Fase 5. Estos valores se cambian
        por ahora en <code className="font-mono">prisma/seed.ts</code> o vía base de datos.
      </Callout>
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <Card key={g.title}>
            <h2 className="font-display text-lg font-semibold text-ink">{g.title}</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {g.rows.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-ink-faint">{k}</dt>
                  <dd className="text-right text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
