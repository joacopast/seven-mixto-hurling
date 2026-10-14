"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { confirmPaymentFromList } from "./actions";

export function PendingPaymentRow({
  registrationId,
  teamName,
  amountLabel,
  whatsappLink,
}: {
  registrationId: string;
  teamName: string;
  amountLabel: string;
  whatsappLink: string | null;
}) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <tr>
      <td className="px-3 py-2 align-top text-ink">{teamName}</td>
      <td className="px-3 py-2 align-top font-mono text-ink-soft">{amountLabel}</td>
      <td className="px-3 py-2 align-top">
        {whatsappLink ? (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            Abrir WhatsApp
          </a>
        ) : (
          <span className="text-ink-faint">sin teléfono</span>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 w-40 text-xs"
          />
          <Button
            size="sm"
            disabled={pending}
            onClick={async () => {
              if (!confirm(`¿Confirmar pago de ${amountLabel} de ${teamName}?`)) return;
              setPending(true);
              const res = await confirmPaymentFromList(registrationId, note);
              setPending(false);
              if (res.error) alert(res.error);
              else router.refresh();
            }}
          >
            {pending ? "…" : "Confirmar"}
          </Button>
        </div>
      </td>
    </tr>
  );
}
