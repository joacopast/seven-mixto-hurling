"use client";

import { useActionState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { requestMagicLink, type LoginState } from "./actions";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestMagicLink, {});

  if (state.sent) {
    return (
      <div className="mt-6 rounded-lg border border-line border-l-[3px] border-l-ok bg-surface-2 p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">Revisá tu email</p>
        <p className="mt-1">
          Te enviamos un enlace de acceso. Es válido por 24 horas. Si no llega, revisá el spam.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="mt-6 flex flex-col gap-4">
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      <Field label="Email" htmlFor="email" error={state.error}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="vos@email.com"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </Button>
    </form>
  );
}
