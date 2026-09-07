"use client";

import { useActionState } from "react";
import type { RegistrationStatus } from "@prisma/client";
import { Select, Button } from "@/components/ui";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament/status";
import { changeRegistrationStatus, type StatusChangeState } from "./actions";

const OPTIONS: RegistrationStatus[] = [
  "PENDING_PAYMENT",
  "PAYMENT_APPROVED",
  "CONFIRMED",
  "OBSERVED",
  "CANCELLED",
  "WAITLISTED",
];

export function StatusChanger({
  teamId,
  current,
}: {
  teamId: string;
  current: RegistrationStatus;
}) {
  const [state, action, pending] = useActionState<StatusChangeState, FormData>(
    changeRegistrationStatus,
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="teamId" value={teamId} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-faint">Nuevo estado</span>
        <Select name="status" defaultValue={current} className="w-64">
          {OPTIONS.map((s) => (
            <option key={s} value={s}>
              {REGISTRATION_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </label>
      <input
        name="reason"
        placeholder="Motivo (opcional)"
        className="h-10 w-64 rounded-lg border border-line bg-surface px-3 text-sm"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Guardando…" : "Aplicar"}
      </Button>
      {state.ok && <span className="text-sm text-ok">Actualizado.</span>}
      {state.error && <span className="text-sm text-danger">{state.error}</span>}
    </form>
  );
}
