import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card, Badge, Crest } from "@/components/ui";
import { SITE } from "@/lib/config";
import { getActiveTournament, getCapacity } from "@/lib/tournament/queries";
import { calculatePrice, formatArs } from "@/lib/tournament/pricing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: SITE.description,
};

const INCLUSIONS_FALLBACK = [
  "1 súper pancho por jugador",
  "Acceso a vestuarios",
  "Fruta e hidratación",
  "Sorteos increíbles",
  "Descuento exclusivo para el after",
  "Fotógrafos",
  "Fútbol y tenis",
  "Parrilla",
];

const FAQ_FALLBACK = [
  {
    q: "¿Cuántos jugadores puedo anotar?",
    a: "El plantel admite entre 7 y 20 jugadores. En cancha se juega de a 7, con un máximo de 3 hombres y sin arquero.",
  },
  {
    q: "¿Todos los equipos juegan después de la fase de grupos?",
    a: "Sí. Los 64 equipos pasan a una de las cuatro copas — Oro, Plata, Bronce o Madera — según su posición en el grupo. Nadie queda eliminado.",
  },
  {
    q: "¿Cómo se paga?",
    a: "Online con Mercado Pago, al final de la inscripción. La inscripción queda confirmada automáticamente cuando se acredita el pago.",
  },
  {
    q: "¿Puedo editar mi equipo después de inscribirme?",
    a: "Sí, desde el portal del equipo, hasta la fecha límite que define la organización.",
  },
];

export default async function HomePage() {
  const tournament = await getActiveTournament();
  const config = tournament.config!;
  const capacity = await getCapacity();

  const now = new Date();
  const exampleQuote = calculatePrice(
    {
      basePlayers: config.basePlayers,
      earlyPrice: config.earlyPrice,
      latePrice: config.latePrice,
      extraPlayerPrice: config.extraPlayerPrice,
      priceChangeAt: config.priceChangeAt,
      paymentSurchargeBp: config.paymentSurchargeBp,
    },
    12,
    now,
  );

  const inclusions = config.inclusionsList.length ? config.inclusionsList : INCLUSIONS_FALLBACK;
  const faq =
    Array.isArray(config.faq) && config.faq.length
      ? (config.faq as { q: string; a: string }[])
      : FAQ_FALLBACK;

  const priceChangeLabel = config.priceChangeAt.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
  });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: tournament.name,
    sport: "Field hockey",
    description: SITE.description,
    ...(tournament.startDate ? { startDate: tournament.startDate.toISOString() } : {}),
    ...(tournament.endDate ? { endDate: tournament.endDate.toISOString() } : {}),
    ...(tournament.venueName ? { location: { "@type": "Place", name: tournament.venueName } } : {}),
    organizer: { "@type": "Organization", name: "Seven Mixto Hurling" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 0%, var(--accent-wash), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pb-24 sm:pt-24">
          <Crest className="mx-auto h-14 w-14 text-paper/90" />
          <p className="eyebrow mt-5">Seven Mixto · {tournament.edition}</p>
          <h1 className="mx-auto mt-3 max-w-3xl font-display text-4xl font-semibold uppercase leading-[1.05] tracking-tight text-paper sm:text-6xl">
            Seven Mixto Hurling CLub
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-ink-soft sm:text-lg">
            64 equipos, un día. Fase de grupos y después Oro, Plata, Bronce o Madera —
            todos los equipos siguen jugando. Inscribí al tuyo, cargá tu plantel y pagá,
            todo desde acá.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/inscripcion" size="lg">
              Inscribí a tu equipo
            </ButtonLink>
            <ButtonLink href="/torneo" size="lg" variant="secondary">
              Ver torneo
            </ButtonLink>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 font-mono text-xs text-ink-faint">
            <span>
              <b className="text-ink-soft">{capacity.confirmed}</b> / {capacity.maxTeams} equipos confirmados
            </span>
            <span>
              <b className="text-ink-soft">{capacity.available}</b> cupos disponibles
            </span>
            {capacity.waitlistCount > 0 && (
              <span>
                <b className="text-ink-soft">{capacity.waitlistCount}</b> en lista de espera
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Formato */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-center font-display text-3xl font-semibold uppercase tracking-tight text-paper sm:text-4xl">
          Cómo se juega
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "16", l: "grupos de 4", d: "Todos contra todos. 3 partidos por equipo.", pop: false },
            { n: "4", l: "copas de 16", d: "Oro, Plata, Bronce y Madera según la posición en el grupo.", pop: false },
            { n: "15′", l: "por partido", d: "6 canchas en simultáneo, todos arrancan y terminan juntos.", pop: false },
            { n: "0", l: "eliminados", d: "Después de grupos, los 64 equipos siguen jugando.", pop: true },
          ].map((item) => (
            <Card key={item.l}>
              <div
                className={`font-display text-4xl font-semibold ${item.pop ? "text-pop-soft" : "text-paper"}`}
              >
                {item.n}
              </div>
              <div className="mt-1 text-sm font-semibold uppercase tracking-wide text-ink">
                {item.l}
              </div>
              <p className="mt-2 text-sm text-ink-soft">{item.d}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Precio + incluye */}
      <section className="border-y border-line-soft bg-bg-deep">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper sm:text-4xl">
                Qué incluye
              </h2>
              <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                {inclusions.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-ink-soft">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-pop" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Card className="self-start rounded-card bg-surface p-6">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Precio de referencia</span>
                <Badge tone={exampleQuote.tier === "EARLY" ? "ok" : "warn"}>
                  {exampleQuote.tier === "EARLY" ? "Hasta el 15/11" : "Post 15/11"}
                </Badge>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-pill p-4 text-center">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">Hasta 15/11</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-paper">
                    {formatArs(config.earlyPrice)}
                  </p>
                  <p className="text-[11px] text-ink-faint">x equipo · 10 jugadores</p>
                </div>
                <div className="rounded-2xl bg-pill p-4 text-center">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">Post 15/11</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-paper">
                    {formatArs(config.latePrice)}
                  </p>
                  <p className="text-[11px] text-ink-faint">x equipo</p>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Jugador adicional (más de {config.basePlayers})</dt>
                  <dd className="font-mono">{formatArs(config.extraPlayerPrice)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Ejemplo: 12 jugadores</dt>
                  <dd className="font-mono">{formatArs(exampleQuote.subtotal)}</dd>
                </div>
                {exampleQuote.surchargeAmount > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Recargo medio de pago</dt>
                    <dd className="font-mono">{formatArs(exampleQuote.surchargeAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-paper">
                  <dt>Total ejemplo</dt>
                  <dd className="font-mono">{formatArs(exampleQuote.totalAmount)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-ink-faint">
                El precio se calcula automáticamente en la inscripción según la cantidad de
                jugadores y la fecha. Después del {priceChangeLabel} rige la tarifa general.
              </p>
              <ButtonLink href="/inscripcion" className="mt-5 w-full">
                Empezar inscripción
              </ButtonLink>
            </Card>
          </div>
        </div>
      </section>

      {/* Proceso */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center font-display text-3xl font-semibold uppercase tracking-tight text-paper sm:text-4xl">
          La inscripción, paso a paso
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            ["Datos del equipo y responsable", "Nombre, escudo y contacto. Creás tu acceso con un enlace por email."],
            ["Cargás tu plantel", "Jugador por jugador. El sistema valida edad, documentos y composición."],
            ["Pagás y quedás confirmado", "Mercado Pago. Al acreditarse el pago, tu equipo queda adentro automáticamente."],
          ].map(([title, desc], i) => (
            <li key={title} className="rounded-card border border-line-soft bg-surface p-6">
              <div className="font-display text-2xl font-semibold text-pop-soft">0{i + 1}</div>
              <h3 className="mt-2 font-display text-lg font-semibold text-paper">{title}</h3>
              <p className="mt-1.5 text-sm text-ink-soft">{desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section className="border-t border-line-soft bg-bg-deep">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-3xl font-semibold uppercase tracking-tight text-paper sm:text-4xl">
            Preguntas frecuentes
          </h2>
          <div className="mt-6 divide-y divide-line-soft">
            {faq.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="cursor-pointer list-none font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {item.q}
                    <span className="text-pop-soft transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-sm text-ink-soft">
            ¿Otra duda? Mirá{" "}
            <Link href="/reglamento" className="text-accent underline">
              el reglamento
            </Link>{" "}
            o escribinos por las redes del club.
          </p>
        </div>
      </section>
    </>
  );
}
