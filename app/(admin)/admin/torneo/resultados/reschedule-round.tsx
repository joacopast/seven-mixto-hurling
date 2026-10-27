"use client";

import { useActionState, useState } from "react";
import { Button, Input } from "@/components/ui";
import { formatFechaHora } from "@/lib/datetime";
import { rescheduleRoundAction, type RescheduleState } from "./actions";

/** Date → valor para <input type="datetime-local"> (hora local). */
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

const initialState: RescheduleState = {};

export function RescheduleRoundButton({ roundId, startsAt }: { roundId: string; startsAt: Date }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => toLocalInput(startsAt));
  const [state, formAction, pending] = useActionState(rescheduleRoundAction, initialState);
  const parsed = value ? new Date(value) : null;
  const valid = parsed && !isNaN(parsed.getTime());

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded px-2 py-0.5 text-xs font-semibold text-accent hover:bg-surface-2"
      >
        Reprogramar
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="roundId" value={roundId} />
      <div className="flex flex-col gap-0.5">
        <Input
          type="datetime-local"
          name="startsAt"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 w-48 text-xs"
        />
        <span className="font-mono text-[10px] text-ink-faint">
          {valid ? formatFechaHora(parsed) : "—"}
        </span>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "…" : "Guardar"}
      </Button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded px-2 py-1 text-xs text-ink-faint hover:bg-surface-2"
      >
        Cancelar
      </button>
      {state.message && <span className="text-xs text-ok">{state.message}</span>}
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
    </form>
  );
}
