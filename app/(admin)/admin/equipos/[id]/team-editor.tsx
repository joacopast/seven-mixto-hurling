"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";
import {
  updateTeam,
  addPlayer,
  removePlayer,
  deleteTeam,
  confirmPayment,
  type TeamEditState,
  type PlayerActionState,
} from "./actions";

interface TeamData {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  seed: number | null;
  adminNotes: string | null;
}

export function TeamEditForm({ team, takenCountries }: { team: TeamData; takenCountries: string[] }) {
  const [state, action, pending] = useActionState<TeamEditState, FormData>(updateTeam, {});
  const taken = new Set(takenCountries);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="teamId" value={team.id} />
      <Field label="País" htmlFor="e-name">
        <Select id="e-name" name="name" defaultValue={team.name}>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name} disabled={taken.has(c.name)}>
              {c.name}
              {taken.has(c.name) ? " (ya inscripto)" : ""}
            </option>
          ))}
        </Select>
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
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" name="isPlayer" defaultChecked className="h-4 w-4 rounded border-line accent-accent" />
        Juega
      </label>
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

export function ConfirmPaymentButton({
  registrationId,
  teamId,
  amountLabel,
}: {
  registrationId: string;
  teamId: string;
  amountLabel: string;
}) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-l-[3px] border-line border-l-ok bg-surface p-3">
      <p className="text-sm font-semibold text-paper">Confirmar pago recibido</p>
      <p className="text-xs text-ink-soft">
        Verificá el comprobante en WhatsApp y confirmá acá. Se cobra siempre{" "}
        <strong>{amountLabel}</strong> (el monto cargado por la inscripción, no se puede editar).
      </p>
      <Input
        placeholder="Nota / referencia (opcional, ej. últimos 4 dígitos, fecha de la transferencia)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          disabled={pending}
          onClick={async () => {
            if (!confirm(`¿Confirmar que se recibió la transferencia de ${amountLabel}?`)) return;
            setPending(true);
            const res = await confirmPayment(registrationId, teamId, note);
            setPending(false);
            if (res.error) alert(res.error);
            else {
              setDone(res.message ?? "Confirmado.");
              router.refresh();
            }
          }}
        >
          {pending ? "Confirmando…" : "Confirmar pago"}
        </Button>
        {done && <span className="text-sm text-ok">{done}</span>}
      </div>
    </div>
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
