"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import {
  updateTeam,
  addPlayer,
  removePlayer,
  deleteTeam,
  type TeamEditState,
  type PlayerActionState,
} from "./actions";

interface TeamData {
  id: string;
  name: string;
  shortName: string | null;
  clubTag: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  seed: number | null;
  adminNotes: string | null;
}

export function TeamEditForm({ team }: { team: TeamData }) {
  const [state, action, pending] = useActionState<TeamEditState, FormData>(updateTeam, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="teamId" value={team.id} />
      <Field label="Nombre" htmlFor="e-name">
        <Input id="e-name" name="name" defaultValue={team.name} />
      </Field>
      <Field label="Nombre corto" htmlFor="e-short">
        <Input id="e-short" name="shortName" defaultValue={team.shortName ?? ""} />
      </Field>
      <Field label="Club / barrio" htmlFor="e-club">
        <Input id="e-club" name="clubTag" defaultValue={team.clubTag ?? ""} />
      </Field>
      <Field label="Seed / ranking" htmlFor="e-seed" hint="Vacío = sin seed.">
        <Input id="e-seed" name="seed" type="number" defaultValue={team.seed ?? ""} />
      </Field>
      <Field label="Responsable" htmlFor="e-cname">
        <Input id="e-cname" name="contactName" defaultValue={team.contactName} />
      </Field>
      <Field label="Email" htmlFor="e-cemail">
        <Input id="e-cemail" name="contactEmail" type="email" defaultValue={team.contactEmail} />
      </Field>
      <Field label="Teléfono" htmlFor="e-cphone">
        <Input id="e-cphone" name="contactPhone" defaultValue={team.contactPhone} />
      </Field>
      <Field label="Notas internas" htmlFor="e-notes">
        <Input id="e-notes" name="adminNotes" defaultValue={team.adminNotes ?? ""} />
      </Field>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
        {state.ok && <span className="text-sm text-ok">Guardado.</span>}
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

export function AddPlayerForm({ teamId }: { teamId: string }) {
  const [state, action, pending] = useActionState<PlayerActionState, FormData>(addPlayer, {});
  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-dashed border-line bg-surface-3/50 p-3 sm:grid-cols-3">
      <input type="hidden" name="teamId" value={teamId} />
      <Input name="firstName" placeholder="Nombre" required />
      <Input name="lastName" placeholder="Apellido" required />
      <Input name="docNumber" placeholder="Documento" required />
      <Input name="birthDate" type="date" required aria-label="Fecha de nacimiento" />
      <Select name="gender" defaultValue="F" aria-label="Género">
        <option value="F">Femenino</option>
        <option value="M">Masculino</option>
        <option value="X">Otro</option>
      </Select>
      <Input name="shirtNumber" type="number" placeholder="# (opcional)" />
      <div className="sm:col-span-3 flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "…" : "Agregar jugador"}
        </Button>
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

export function RemovePlayerButton({ playerId, teamId }: { playerId: string; teamId: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (!confirm("¿Quitar este jugador?")) return;
        setPending(true);
        const res = await removePlayer(playerId, teamId);
        setPending(false);
        if (res.error) alert(res.error);
        else router.refresh();
      }}
      className="rounded px-2 py-1 text-xs text-danger hover:bg-surface-2 disabled:opacity-50"
    >
      Quitar
    </button>
  );
}

export function DeleteTeamButton({ teamId }: { teamId: string }) {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (!confirm("Eliminar el equipo definitivamente. ¿Seguro?")) return;
        setPending(true);
        const res = await deleteTeam(teamId);
        setPending(false);
        if (res?.error) alert(res.error);
      }}
      className="rounded-full border border-danger/50 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
    >
      Eliminar equipo
    </button>
  );
}
