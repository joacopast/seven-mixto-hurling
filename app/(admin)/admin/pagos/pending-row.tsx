"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { CopyTextarea } from "@/components/copy-textarea";
import { confirmPaymentFromList } from "./actions";

interface PendingPaymentProps {
  registrationId: string;
  teamName: string;
  statusBadge: React.ReactNode;
  paidLabel: string;
  owedLabel: string;
  /** Lo que falta pagar, en pesos (no centavos) — prellena el monto a confirmar. */
  owedPesos: number;
  whatsappLink: string | null;
}

/** Estado y acción de "confirmar pago" — compartido entre la fila de tabla (desktop) y la tarjeta (mobile). */
function usePendingPaymentConfirm({ registrationId, teamName, owedPesos }: PendingPaymentProps) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(String(owedPesos));
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [whatsappMessage, setWhatsappMessage] = useState<string | null>(null);
  const amountNum = Number(amount);
  const isDeposit = amountNum > 0 && amountNum < owedPesos;

  async function confirmPayment() {
    if (
      !confirm(
        `¿Confirmar ${isDeposit ? "seña" : "pago"} de $${amountNum.toLocaleString("es-AR")} de ${teamName}?`,
      )
    )
      return;
    setPending(true);
    const res = await confirmPaymentFromList(registrationId, note, amountNum);
    setPending(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setDone(res.message ?? "Confirmado.");
    setWhatsappMessage(res.whatsappMessage ?? null);
  }

  return { note, setNote, amount, setAmount, pending, done, whatsappMessage, amountNum, isDeposit, confirmPayment };
}

/** Cuadro de WhatsApp post-confirmación — no refresca la lista hasta que el admin lo copia. */
function WhatsAppFollowUp({ teamName, whatsappMessage }: { teamName: string; whatsappMessage: string }) {
  const router = useRouter();
  return (
    <div className="rounded-xl bg-surface-2/50 p-3">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">
          Pago confirmado — pegalo en el WhatsApp de {teamName} para que sepan cómo seguir:
        </p>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="flex-none rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-surface-2"
        >
          Listo, actualizar lista
        </button>
      </div>
      <CopyTextarea value={whatsappMessage} />
    </div>
  );
}

/** Fila de tabla — se usa a partir de `md`, cuando entra una tabla de 6 columnas sin apretar. */
export function PendingPaymentRow(props: PendingPaymentProps) {
  const { teamName, statusBadge, paidLabel, owedLabel, owedPesos, whatsappLink } = props;
  const s = usePendingPaymentConfirm(props);

  return (
    <>
      <tr>
        <td className="px-3 py-2 align-top text-ink">{teamName}</td>
        <td className="px-3 py-2 align-top">{statusBadge}</td>
        <td className="px-3 py-2 align-top font-mono text-ink-soft">{paidLabel}</td>
        <td className="px-3 py-2 align-top font-mono text-ink-soft">{owedLabel}</td>
        <td className="px-3 py-2 align-top">
          {whatsappLink ? (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              Abrir WhatsApp
            </a>
          ) : (
            <span className="text-ink-faint">sin teléfono</span>
          )}
        </td>
        <td className="px-3 py-2 align-top">
          {s.done ? (
            <span className="text-xs text-ok">{s.done}</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                max={owedPesos}
                value={s.amount}
                onChange={(e) => s.setAmount(e.target.value)}
                className="h-9 w-20 text-xs"
              />
              <Input
                placeholder="Nota (opcional)"
                value={s.note}
                onChange={(e) => s.setNote(e.target.value)}
                className="h-9 w-32 text-xs"
              />
              <Button size="sm" disabled={s.pending || !s.amountNum || s.amountNum <= 0} onClick={s.confirmPayment}>
                {s.pending ? "…" : s.isDeposit ? "Confirmar seña" : "Confirmar"}
              </Button>
            </div>
          )}
        </td>
      </tr>
      {s.whatsappMessage && (
        <tr>
          <td colSpan={6} className="px-3 py-3">
            <WhatsAppFollowUp teamName={teamName} whatsappMessage={s.whatsappMessage} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Tarjeta apilada — se usa debajo de `md`: todo el campo de acción queda a una sola columna, sin scroll horizontal. */
export function PendingPaymentCard(props: PendingPaymentProps) {
  const { teamName, statusBadge, paidLabel, owedLabel, owedPesos, whatsappLink } = props;
  const s = usePendingPaymentConfirm(props);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line-soft bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-ink">{teamName}</span>
        {statusBadge}
      </div>
      <div className="flex gap-4 font-mono text-xs text-ink-soft">
        <span>Pagado: {paidLabel}</span>
        <span>Falta: {owedLabel}</span>
      </div>
      {whatsappLink ? (
        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="text-sm text-accent underline">
          Abrir WhatsApp
        </a>
      ) : (
        <span className="text-sm text-ink-faint">sin teléfono</span>
      )}

      {s.done ? (
        <span className="text-sm text-ok">{s.done}</span>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={owedPesos}
              value={s.amount}
              onChange={(e) => s.setAmount(e.target.value)}
              className="h-11 flex-1 text-base"
              aria-label="Monto a confirmar"
            />
            <Input
              placeholder="Nota (opcional)"
              value={s.note}
              onChange={(e) => s.setNote(e.target.value)}
              className="h-11 flex-1 text-base"
            />
          </div>
          <Button disabled={s.pending || !s.amountNum || s.amountNum <= 0} onClick={s.confirmPayment} className="w-full">
            {s.pending ? "…" : s.isDeposit ? "Confirmar seña" : "Confirmar pago"}
          </Button>
        </div>
      )}

      {s.whatsappMessage && <WhatsAppFollowUp teamName={teamName} whatsappMessage={s.whatsappMessage} />}
    </div>
  );
}
