"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { staffLogin, type StaffLoginState } from "./actions";

export function StaffLoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState<StaffLoginState, FormData>(staffLogin, {});

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      <Field label="Usuario" htmlFor="username">
        <Input id="username" name="username" autoComplete="username" required autoFocus />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={state.error}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
