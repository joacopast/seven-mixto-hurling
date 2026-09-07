"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { createTeam, type NewTeamState } from "./actions";

export function NewTeamForm() {
  const [state, action, pending] = useActionState<NewTeamState, FormData>(createTeam, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nombre del equipo" htmlFor="name">
        <Input id="name" name="name" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre corto" htmlFor="shortName">
          <Input id="shortName" name="shortName" maxLength={20} />
        </Field>
        <Field label="Club / barrio" htmlFor="clubTag">
          <Input id="clubTag" name="clubTag" maxLength={40} />
        </Field>
      </div>
      <Field label="Responsable" htmlFor="contactName">
        <Input id="contactName" name="contactName" required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="contactEmail">
          <Input id="contactEmail" name="contactEmail" type="email" required />
        </Field>
        <Field label="Teléfono" htmlFor="contactPhone">
          <Input id="contactPhone" name="contactPhone" required />
        </Field>
      </div>
      <Field label="Estado de inscripción" htmlFor="registrationStatus">
        <Select id="registrationStatus" name="registrationStatus" defaultValue="CONFIRMED">
          <option value="CONFIRMED">Confirmada (ocupa cupo)</option>
          <option value="PENDING_PAYMENT">Pendiente de pago</option>
          <option value="DRAFT">Borrador</option>
          <option value="WAITLISTED">Lista de espera</option>
        </Select>
      </Field>
      <Field label="Notas internas" htmlFor="adminNotes">
        <Input id="adminNotes" name="adminNotes" maxLength={500} />
      </Field>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear equipo"}
      </Button>
    </form>
  );
}
