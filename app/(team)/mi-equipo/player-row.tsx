"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Field, Input, Select, Badge } from "@/components/ui";
import { updateMyPlayerAction, type EditPlayerState } from "./actions";

export interface PlayerRowData {
  id: string;
  firstName: string;
  lastName: string;
  docType: "DNI" | "PASSPORT";
  docNumber: string;
  birthDate: string; // yyyy-mm-dd
  gender: "M" | "F" | "X";
  shirtNumber: number | null;
  dietaryRestriction: string | null;
  attendsParty: boolean;
  playsHockey: boolean;
  age: number;
}

const initialState: EditPlayerState = {};

export function PlayerRow({ player, locked }: { player: PlayerRowData; locked: boolean }) {
  const [editing, setEditing] = useState(false);
  const action = updateMyPlayerAction.bind(null, player.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state]);

  if (!editing) {
    return (
      <tr>
        <td className="px-3 py-2 text-ink">
          {player.firstName} {player.lastName}
        </td>
        <td className="px-3 py-2 font-mono text-xs text-ink-soft">
          {player.docType} {player.docNumber}
        </td>
        <td className="px-3 py-2 font-mono text-ink-soft">{player.age}</td>
        <td className="px-3 py-2 text-ink-soft">{player.gender}</td>
        <td className="px-3 py-2 font-mono text-ink-soft">{player.shirtNumber ?? "—"}</td>
        <td className="px-3 py-2">
          {player.playsHockey ? (
            <Badge tone="ok">Jugador</Badge>
          ) : (
            <Badge tone="neutral">No jugador</Badge>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-ink-soft">
          {player.dietaryRestriction ?? "—"}
          {!player.attendsParty && (
            <span className="ml-1.5 rounded-full border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase text-ink-faint">
              No va a la fiesta
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          {!locked && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-2"
            >
              Editar
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={7} className="bg-surface-2 px-3 py-4">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nombre" htmlFor={`fn-${player.id}`}>
              <Input id={`fn-${player.id}`} name="firstName" defaultValue={player.firstName} />
            </Field>
            <Field label="Apellido" htmlFor={`ln-${player.id}`}>
              <Input id={`ln-${player.id}`} name="lastName" defaultValue={player.lastName} />
            </Field>
            <Field label="Tipo doc." htmlFor={`dt-${player.id}`}>
              <Select id={`dt-${player.id}`} name="docType" defaultValue={player.docType}>
                <option value="DNI">DNI</option>
                <option value="PASSPORT">Pasaporte</option>
              </Select>
            </Field>
            <Field label="Número de documento" htmlFor={`dn-${player.id}`}>
              <Input id={`dn-${player.id}`} name="docNumber" defaultValue={player.docNumber} />
            </Field>
            <Field label="Fecha de nacimiento" htmlFor={`bd-${player.id}`}>
              <Input id={`bd-${player.id}`} name="birthDate" type="date" defaultValue={player.birthDate} />
            </Field>
            <Field label="Género" htmlFor={`g-${player.id}`}>
              <Select id={`g-${player.id}`} name="gender" defaultValue={player.gender}>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="X">Otro / no binario</option>
              </Select>
            </Field>
            <Field label="N.º camiseta" htmlFor={`sn-${player.id}`} hint="Opcional.">
              <Input
                id={`sn-${player.id}`}
                name="shirtNumber"
                inputMode="numeric"
                defaultValue={player.shirtNumber ?? ""}
              />
            </Field>
            <Field
              label="Restricción alimenticia"
              htmlFor={`diet-${player.id}`}
              hint="Opcional: vegetariano, celíaco, alergias…"
            >
              <Input
                id={`diet-${player.id}`}
                name="dietaryRestriction"
                defaultValue={player.dietaryRestriction ?? ""}
              />
            </Field>
            <Field
              label="¿Juega hockey?"
              htmlFor={`hockey-${player.id}`}
              hint="Ayuda a armar los grupos por nivel."
            >
              <Select
                id={`hockey-${player.id}`}
                name="playsHockey"
                defaultValue={player.playsHockey ? "true" : "false"}
              >
                <option value="true">Sí, juega hockey</option>
                <option value="false">No juega hockey</option>
              </Select>
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="attendsParty"
              defaultChecked={player.attendsParty}
              className="h-4 w-4 rounded border-line accent-accent"
            />
            Se queda a la fiesta post torneo
          </label>

          {state.error && <p className="text-xs text-danger">{state.error}</p>}

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}
