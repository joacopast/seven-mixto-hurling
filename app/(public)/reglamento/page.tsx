import type { Metadata } from "next";
import { getActiveTournament } from "@/lib/tournament/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reglamento",
  description: "Reglas del torneo Seven Mixto Hurling: formato, partidos y reglas de juego.",
};

const DEFAULT_RULES = [
  { h: "Formato", items: [
    "64 equipos. Fase de grupos: 16 grupos de 4, todos contra todos (3 partidos por equipo).",
    "Después de grupos, los 64 equipos pasan a una copa según su posición: 1º → Oro, 2º → Plata, 3º → Bronce, 4º → Madera.",
    "Cada copa se juega por eliminación directa: octavos, cuartos, semifinal y final.",
  ]},
  { h: "Partidos", items: [
    "Duración: 15 minutos.",
    "Se juegan 6 partidos en simultáneo.",
    "Todos los partidos de una tanda empiezan y terminan al mismo horario.",
    "Si un equipo no se presenta en tiempo y forma, pierde los puntos.",
  ]},
  { h: "Reglas de juego", items: [
    "7 personas en cancha.",
    "Máximo 3 hombres en cancha.",
    "Se juega sin arquero.",
    "Está prohibido jugar de flick y/o pegada.",
  ]},
];

export default async function ReglamentoPage() {
  const tournament = await getActiveTournament();
  const custom = tournament.config?.rulesMarkdown?.trim();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-faint">{tournament.edition}</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">Reglamento</h1>

      {custom ? (
        <article className="mt-8 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
          {custom}
        </article>
      ) : (
        <div className="mt-8 space-y-8">
          {DEFAULT_RULES.map((block) => (
            <section key={block.h}>
              <h2 className="font-display text-xl font-semibold text-ink">{block.h}</h2>
              <ul className="mt-3 space-y-2">
                {block.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink-soft">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-sliotar" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="rounded-lg border border-line border-l-[3px] border-l-info bg-surface p-4 text-xs text-ink-faint">
            Texto provisorio. El reglamento oficial completo lo carga la organización desde el panel.
          </p>
        </div>
      )}
    </div>
  );
}
