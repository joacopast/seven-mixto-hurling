"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Field, Input, Select, Badge } from "@/components/ui";
import { updatePlayerAction, type EditPlayerState } from "./actions";
import { RemovePlayerButton } from "./team-editor";

export interface AdminPlayerRowData {
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

export function AdminPlayerRow({ player, teamId }: { player: AdminPlayerRowData; teamId: string }) {
  const [editing, setEditing] = useState(false);
  const action = updatePlayerAction.bind(null, player.id, teamId);
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
        <td className="px-3 py-2 text-xs text-ink-soft">{player.dietaryRestriction ?? "—"}</td>
        <td className="px-3 py-2">
          {player.attendsParty ? <Badge tone="ok">Sí</Badge> : <Badge tone="neutral">No</Badge>}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded px-2 py-1 text-xs font-semibold text-accent hover:bg-surface-2"
            >
              Editar
            </button>
            <RemovePlayerButton playerId={player.id} teamId={teamId} />
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={9} className="bg-surface-2 px-3 py-4">
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nombre" htmlFor={`a-fn-${player.id}`}>
              <Input id={`a-fn-${player.id}`} name="firstName" defaultValue={player.firstName} />
            </Field>
            <Field label="Apellido" htmlFor={`a-ln-${player.id}`}>
              <Input id={`a-ln-${player.id}`} name="lastName" defaultValue={player.lastName} />
            </Field>
            <Field label="Tipo doc." htmlFor={`a-dt-${player.id}`}>
              <Select id={`a-dt-${player.id}`} name="docType" defaultValue={player.docType}>
                <option value="DNI">DNI</option>
                <option value="PASSPORT">Pasaporte</option>
              </Select>
            </Field>
            <Field label="Número de documento" htmlFor={`a-dn-${player.id}`}>
              <Input id={`a-dn-${player.id}`} name="docNumber" defaultValue={player.docNumber} />
            </Field>
            <Field label="Fecha de nacimiento" htmlFor={`a-bd-${player.id}`}>
              <Input id={`a-bd-${player.id}`} name="birthDate" type="date" defaultValue={player.birthDate} />
            </Field>
            <Field label="Género" htmlFor={`a-g-${player.id}`}>
              <Select id={`a-g-${player.id}`} name="gender" defaultValue={player.gender}>
                <option value="F">Femenino</option>
                <option value="M">Masculino</option>
                <option value="X">Otro / no binario</option>
              </Select>
            </Field>
            <Field label="N.º camiseta" htmlFor={`a-sn-${player.id}`} hint="Opcional.">
              <Input
                id={`a-sn-${player.id}`}
                name="shirtNumber"
                inputMode="numeric"
                defaultValue={player.shirtNumber ?? ""}
              />
            </Field>
            <Field
              label="Restricción alimenticia"
              htmlFor={`a-diet-${player.id}`}
              hint="Opcional: vegetariano, celíaco, alergias…"
            >
              <Input
                id={`a-diet-${player.id}`}
                name="dietaryRestriction"
                defaultValue={player.dietaryRestriction ?? ""}
              />
            </Field>
            <Field
              label="¿Juega hockey?"
              htmlFor={`a-hockey-${player.id}`}
              hint="Ayuda a armar los grupos por nivel."
            >
              <Select
                id={`a-hockey-${player.id}`}
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
