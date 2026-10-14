"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { confirmPaymentFromList } from "./actions";

export function PendingPaymentRow({
  registrationId,
  teamName,
  statusBadge,
  paidLabel,
  owedLabel,
  owedPesos,
  whatsappLink,
}: {
  registrationId: string;
  teamName: string;
  statusBadge: React.ReactNode;
  paidLabel: string;
  owedLabel: string;
  /** Lo que falta pagar, en pesos (no centavos) — prellena el monto a confirmar. */
  owedPesos: number;
  whatsappLink: string | null;
}) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(String(owedPesos));
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const amountNum = Number(amount);
  const isDeposit = amountNum > 0 && amountNum < owedPesos;

  return (
    <tr>
      <td className="px-3 py-2 align-top text-ink">{teamName}</td>
      <td className="px-3 py-2 align-top">{statusBadge}</td>
      <td className="px-3 py-2 align-top font-mono text-ink-soft">{paidLabel}</td>
      <td className="px-3 py-2 align-top font-mono text-ink-soft">{owedLabel}</td>
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
            type="number"
            min={1}
            max={owedPesos}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-20 text-xs"
          />
          <Input
            placeholder="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 w-32 text-xs"
          />
          <Button
            size="sm"
            disabled={pending || !amountNum || amountNum <= 0}
            onClick={async () => {
              if (
                !confirm(
                  `¿Confirmar ${isDeposit ? "seña" : "pago"} de $${amountNum.toLocaleString("es-AR")} de ${teamName}?`,
                )
              )
                return;
              setPending(true);
              const res = await confirmPaymentFromList(registrationId, note, amountNum);
              setPending(false);
              if (res.error) alert(res.error);
              else router.refresh();
            }}
          >
            {pending ? "…" : isDeposit ? "Confirmar seña" : "Confirmar"}
          </Button>
        </div>
      </td>
    </tr>
  );
}
