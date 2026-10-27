"use client";

import { useActionState, useState } from "react";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { formatFechaHora } from "@/lib/datetime";
import { saveConfig, type ConfigState } from "./actions";

/**
 * <input type="datetime-local"> muestra el valor con el formato del
 * navegador/SO (puede salir en inglés, 12hs, MM/DD/YYYY…), fuera de nuestro
 * control. Le agregamos una leyenda abajo con el valor en DD/MM/YYYY HH:MM,
 * siempre igual sin importar el idioma del navegador.
 */
function DateTimeField({
  id,
  name,
  defaultValue,
}: {
  id: string;
  name: string;
  defaultValue: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const parsed = value ? new Date(value) : null;
  const valid = parsed && !isNaN(parsed.getTime());
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        name={name}
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <span className="font-mono text-[11px] text-ink-faint">
        {valid ? formatFechaHora(parsed) : "—"}
      </span>
    </div>
  );
}

export interface ConfigValues {
  name: string;
  edition: string;
  venueName: string;
  startDate: string;
  endDate: string;
  maxTeams: number;
  groupCount: number;
  groupSize: number;
  cupNames: string;
  cupAssignmentStrategy: string;
  thirdPlaceMatch: boolean;
  matchDurationMin: number;
  fieldCount: number;
  turnoverMin: number;
  drawResolution: string;
  waterBreakEveryMatches: number;
  waterBreakMinutes: number;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  pointsWalkover: number;
  walkoverScore: string;
  tiebreakers: string[];
  minPlayers: number;
  maxPlayers: number;
  playersOnField: number;
  maxMenOnField: number;
  minPlayerAge: number;
  basePlayers: number;
  earlyPricePesos: number;
  latePricePesos: number;
  extraPlayerPricePesos: number;
  priceChangeAt: string;
  paymentSurchargePct: number;
  paymentMethod: string;
  bankHolderName: string;
  bankCuit: string;
  bankName: string;
  bankAlias: string;
  bankCbu: string;
  whatsappPhone: string;
  whatsappMessageTemplate: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  rosterLockAt: string;
  teamEditLockAt: string;
  waitlistPaymentWindowHours: number;
  rulesMarkdown: string;
  inclusionsList: string;
  faqJson: string;
  instagramUrl: string;
}

const TIEBREAKERS = [
  ["POINTS", "Puntos"],
  ["HEAD_TO_HEAD", "Enfrentamiento directo"],
  ["GOAL_DIFF", "Diferencia de gol"],
  ["GOALS_FOR", "Goles a favor"],
  ["FAIR_PLAY", "Fair play"],
  ["DRAW_LOTS", "Sorteo"],
] as const;

export function ConfigForm({ values, structureLocked }: { values: ConfigValues; structureLocked: boolean }) {
  const [state, action, pending] = useActionState<ConfigState, FormData>(saveConfig, {});
  const err = (k: string) => state.fieldErrors?.[k];

  return (
    <form action={action} className="flex flex-col gap-6">
      {structureLocked && (
        <p className="rounded-2xl border border-line border-l-[3px] border-l-warn bg-surface p-3 text-xs text-ink-soft">
          Ya hay grupos o fixture: los campos de equipos/grupos están bloqueados. Borralos para
          cambiarlos.
        </p>
      )}

      <Section title="Torneo">
        <Field label="Nombre" htmlFor="name" error={err("name")}>
          <Input id="name" name="name" defaultValue={values.name} />
        </Field>
        <Field label="Edición" htmlFor="edition" error={err("edition")}>
          <Input id="edition" name="edition" defaultValue={values.edition} />
        </Field>
        <Field label="Sede" htmlFor="venueName">
          <Input id="venueName" name="venueName" defaultValue={values.venueName} />
        </Field>
        <Field label="Inicio" htmlFor="startDate">
          <DateTimeField id="startDate" name="startDate" defaultValue={values.startDate} />
        </Field>
        <Field label="Fin" htmlFor="endDate">
          <DateTimeField id="endDate" name="endDate" defaultValue={values.endDate} />
        </Field>
      </Section>

      <Section title="Estructura">
        <Field label="Equipos máximos" htmlFor="maxTeams" error={err("maxTeams")}>
          <Input id="maxTeams" name="maxTeams" type="number" defaultValue={values.maxTeams} disabled={structureLocked} />
        </Field>
        <Field label="Cantidad de grupos" htmlFor="groupCount" error={err("groupCount")}>
          <Input id="groupCount" name="groupCount" type="number" defaultValue={values.groupCount} disabled={structureLocked} />
        </Field>
        <Field label="Equipos por grupo" htmlFor="groupSize" error={err("groupSize")}>
          <Input id="groupSize" name="groupSize" type="number" defaultValue={values.groupSize} disabled={structureLocked} />
        </Field>
        <Field
          label="Copas (nombres, separados por coma)"
          htmlFor="cupNames"
          error={err("cupNames")}
          hint="La cantidad de copas sale de cuántos nombres pongas acá — sacar uno baja la cantidad. Se puede cambiar incluso después de la fase de grupos (antes de generar las copas). Si el grupo más chico tiene menos equipos que copas, va a rechazar con un error claro al generar."
        >
          <Input id="cupNames" name="cupNames" defaultValue={values.cupNames} />
        </Field>
        <Field label="Asignación de copas" htmlFor="cupAssignmentStrategy">
          <Select id="cupAssignmentStrategy" name="cupAssignmentStrategy" defaultValue={values.cupAssignmentStrategy}>
            <option value="GROUP_POSITION">Por posición en el grupo</option>
            <option value="GLOBAL_RANKING">Por ranking global</option>
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="thirdPlaceMatch" defaultChecked={values.thirdPlaceMatch} />
          Partido por el 3er puesto
        </label>
      </Section>

      <Section title="Partidos y canchas">
        <Field label="Duración (min)" htmlFor="matchDurationMin">
          <Input id="matchDurationMin" name="matchDurationMin" type="number" defaultValue={values.matchDurationMin} />
        </Field>
        <Field label="Canchas" htmlFor="fieldCount">
          <Input id="fieldCount" name="fieldCount" type="number" defaultValue={values.fieldCount} />
        </Field>
        <Field label="Recambio entre tandas (min)" htmlFor="turnoverMin">
          <Input id="turnoverMin" name="turnoverMin" type="number" defaultValue={values.turnoverMin} />
        </Field>
        <Field label="Definición por empate" htmlFor="drawResolution">
          <Select id="drawResolution" name="drawResolution" defaultValue={values.drawResolution}>
            <option value="SHOOTOUT">Penales</option>
            <option value="EXTRA_TIME">Tiempo extra</option>
            <option value="NONE">Sin definición</option>
          </Select>
        </Field>
        <Field
          label="Pausa de riego cada (partidos por cancha)"
          htmlFor="waterBreakEveryMatches"
          hint="0 = sin pausas de riego."
        >
          <Input
            id="waterBreakEveryMatches"
            name="waterBreakEveryMatches"
            type="number"
            defaultValue={values.waterBreakEveryMatches}
          />
        </Field>
        <Field label="Duración de la pausa (min)" htmlFor="waterBreakMinutes">
          <Input
            id="waterBreakMinutes"
            name="waterBreakMinutes"
            type="number"
            defaultValue={values.waterBreakMinutes}
          />
        </Field>
      </Section>

      <Section title="Puntos y desempates">
        <Field label="Puntos por victoria" htmlFor="pointsWin">
          <Input id="pointsWin" name="pointsWin" type="number" defaultValue={values.pointsWin} />
        </Field>
        <Field label="Puntos por empate" htmlFor="pointsDraw">
          <Input id="pointsDraw" name="pointsDraw" type="number" defaultValue={values.pointsDraw} />
        </Field>
        <Field label="Puntos por derrota" htmlFor="pointsLoss">
          <Input id="pointsLoss" name="pointsLoss" type="number" defaultValue={values.pointsLoss} />
        </Field>
        <Field label="Puntos por walkover" htmlFor="pointsWalkover">
          <Input id="pointsWalkover" name="pointsWalkover" type="number" defaultValue={values.pointsWalkover} />
        </Field>
        <Field label="Resultado de walkover" htmlFor="walkoverScore" error={err("walkoverScore")}>
          <Input id="walkoverScore" name="walkoverScore" defaultValue={values.walkoverScore} placeholder="3-0" />
        </Field>
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-sm font-semibold text-ink">Criterios de desempate (orden)</p>
          <div className="flex flex-wrap gap-2">
            {TIEBREAKERS.map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  name="tiebreakers"
                  value={value}
                  defaultChecked={values.tiebreakers.includes(value)}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-faint">
            Se aplican en el orden de la lista: {values.tiebreakers.join(" → ")}
          </p>
        </div>
      </Section>

      <Section title="Plantel">
        <Field label="Jugadores mínimos" htmlFor="minPlayers">
          <Input id="minPlayers" name="minPlayers" type="number" defaultValue={values.minPlayers} />
        </Field>
        <Field label="Jugadores máximos" htmlFor="maxPlayers">
          <Input id="maxPlayers" name="maxPlayers" type="number" defaultValue={values.maxPlayers} />
        </Field>
        <Field label="En cancha" htmlFor="playersOnField">
          <Input id="playersOnField" name="playersOnField" type="number" defaultValue={values.playersOnField} />
        </Field>
        <Field label="Máx. hombres en cancha" htmlFor="maxMenOnField">
          <Input id="maxMenOnField" name="maxMenOnField" type="number" defaultValue={values.maxMenOnField} />
        </Field>
        <Field label="Edad mínima" htmlFor="minPlayerAge">
          <Input id="minPlayerAge" name="minPlayerAge" type="number" defaultValue={values.minPlayerAge} />
        </Field>
      </Section>

      <Section title="Precios (en pesos)">
        <Field label="Jugadores incluidos" htmlFor="basePlayers">
          <Input id="basePlayers" name="basePlayers" type="number" defaultValue={values.basePlayers} />
        </Field>
        <Field label="Tarifa temprana ($)" htmlFor="earlyPrice">
          <Input id="earlyPrice" name="earlyPrice" type="number" defaultValue={values.earlyPricePesos} />
        </Field>
        <Field label="Tarifa general ($)" htmlFor="latePrice">
          <Input id="latePrice" name="latePrice" type="number" defaultValue={values.latePricePesos} />
        </Field>
        <Field label="Jugador adicional ($)" htmlFor="extraPlayerPrice">
          <Input id="extraPlayerPrice" name="extraPlayerPrice" type="number" defaultValue={values.extraPlayerPricePesos} />
        </Field>
        <Field label="Cambio de precio" htmlFor="priceChangeAt" error={err("priceChangeAt")}>
          <DateTimeField id="priceChangeAt" name="priceChangeAt" defaultValue={values.priceChangeAt} />
        </Field>
        <Field
          label="Recargo adicional (%)"
          htmlFor="paymentSurchargePct"
          hint="Se suma al total. Dejalo en 0 si no cobrás recargo (ej. transferencia sin comisión)."
        >
          <Input id="paymentSurchargePct" name="paymentSurchargePct" type="number" step="0.1" defaultValue={values.paymentSurchargePct} />
        </Field>
      </Section>

      <Section title="Medio de pago">
        <Field label="Cómo pagan los equipos" htmlFor="paymentMethod">
          <Select id="paymentMethod" name="paymentMethod" defaultValue={values.paymentMethod}>
            <option value="MANUAL_TRANSFER">Transferencia bancaria + comprobante por WhatsApp</option>
            <option value="MERCADOPAGO">Mercado Pago (cobra comisión)</option>
          </Select>
        </Field>
        <Field label="Titular de la cuenta" htmlFor="bankHolderName">
          <Input id="bankHolderName" name="bankHolderName" defaultValue={values.bankHolderName} />
        </Field>
        <Field label="CUIT / CUIL" htmlFor="bankCuit">
          <Input id="bankCuit" name="bankCuit" defaultValue={values.bankCuit} />
        </Field>
        <Field label="Banco" htmlFor="bankName">
          <Input id="bankName" name="bankName" defaultValue={values.bankName} />
        </Field>
        <Field label="Alias" htmlFor="bankAlias">
          <Input id="bankAlias" name="bankAlias" defaultValue={values.bankAlias} />
        </Field>
        <Field label="CBU / CVU" htmlFor="bankCbu">
          <Input id="bankCbu" name="bankCbu" defaultValue={values.bankCbu} />
        </Field>
        <Field label="WhatsApp para comprobantes" htmlFor="whatsappPhone" hint="Con código de país, ej. 5491122334455.">
          <Input id="whatsappPhone" name="whatsappPhone" defaultValue={values.whatsappPhone} />
        </Field>
        <div className="sm:col-span-2">
          <Field
            label="Mensaje precargado de WhatsApp"
            htmlFor="whatsappMessageTemplate"
            hint="Podés usar {team} y {amount}."
          >
            <Input
              id="whatsappMessageTemplate"
              name="whatsappMessageTemplate"
              defaultValue={values.whatsappMessageTemplate}
            />
          </Field>
        </div>
      </Section>

      <Section title="Fechas">
        <Field label="Inscripción abre" htmlFor="registrationOpensAt">
          <DateTimeField id="registrationOpensAt" name="registrationOpensAt" defaultValue={values.registrationOpensAt} />
        </Field>
        <Field label="Inscripción cierra" htmlFor="registrationClosesAt">
          <DateTimeField id="registrationClosesAt" name="registrationClosesAt" defaultValue={values.registrationClosesAt} />
        </Field>
        <Field label="Cierre de edición de equipo" htmlFor="teamEditLockAt">
          <DateTimeField id="teamEditLockAt" name="teamEditLockAt" defaultValue={values.teamEditLockAt} />
        </Field>
        <Field label="Cierre de edición de plantel" htmlFor="rosterLockAt">
          <DateTimeField id="rosterLockAt" name="rosterLockAt" defaultValue={values.rosterLockAt} />
        </Field>
        <Field label="Ventana de pago (lista de espera, h)" htmlFor="waitlistPaymentWindowHours">
          <Input id="waitlistPaymentWindowHours" name="waitlistPaymentWindowHours" type="number" defaultValue={values.waitlistPaymentWindowHours} />
        </Field>
      </Section>

      <Section title="Contenido público">
        <div className="sm:col-span-2">
          <Field label="Reglamento (texto)" htmlFor="rulesMarkdown">
            <textarea
              id="rulesMarkdown"
              name="rulesMarkdown"
              rows={8}
              defaultValue={values.rulesMarkdown}
              className="w-full rounded-xl border border-line bg-surface-3 p-3 text-sm text-ink"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Qué incluye (una por línea)" htmlFor="inclusionsList">
            <textarea
              id="inclusionsList"
              name="inclusionsList"
              rows={5}
              defaultValue={values.inclusionsList}
              className="w-full rounded-xl border border-line bg-surface-3 p-3 text-sm text-ink"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="FAQ (JSON: [{q, a}])" htmlFor="faqJson">
            <textarea
              id="faqJson"
              name="faqJson"
              rows={5}
              defaultValue={values.faqJson}
              className="w-full rounded-xl border border-line bg-surface-3 p-3 font-mono text-xs text-ink"
            />
          </Field>
        </div>
        <Field label="Instagram" htmlFor="instagramUrl">
          <Input id="instagramUrl" name="instagramUrl" defaultValue={values.instagramUrl} />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar configuración"}
        </Button>
        {state.ok && <span className="text-sm text-ok">Guardado.</span>}
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
      {state.warnings && state.warnings.length > 0 && (
        <ul className="rounded-2xl border border-line border-l-[3px] border-l-warn bg-surface p-3 text-xs text-ink-soft">
          {state.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 font-display text-lg font-semibold text-paper">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}
