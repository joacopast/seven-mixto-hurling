"use client";

import { useActionState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";
import { joinWaitlistAction, type WaitlistState } from "./waitlist-actions";

export function WaitlistForm({ takenCountries }: { takenCountries: string[] }) {
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlistAction, {});
  const taken = new Set(takenCountries);

  if (state.position) {
    return (
      <div className="rounded-lg border border-line border-l-[3px] border-l-ok bg-surface p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">Quedaste en la lista de espera</p>
        <p className="mt-1">
          Sos el número {state.position}. Si se libera un cupo te avisamos por email.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 text-left">
      <Field label="País" htmlFor="teamName" error={state.fieldErrors?.teamName}>
        <Select id="teamName" name="teamName" required defaultValue="">
          <option value="">Elegí un país…</option>
          {COUNTRIES.map((c) => (
            <option key={c.name} value={c.name} disabled={taken.has(c.name)}>
              {c.name}
              {taken.has(c.name) ? " (ya inscripto)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Responsable" htmlFor="contactName" error={state.fieldErrors?.contactName}>
        <Input id="contactName" name="contactName" required />
      </Field>
      <Field label="Email" htmlFor="contactEmail" error={state.fieldErrors?.contactEmail}>
        <Input id="contactEmail" name="contactEmail" type="email" required />
      </Field>
      <Field label="Teléfono" htmlFor="contactPhone" error={state.fieldErrors?.contactPhone}>
        <Input id="contactPhone" name="contactPhone" required />
      </Field>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Sumarme a la lista de espera"}
      </Button>
    </form>
  );
}
