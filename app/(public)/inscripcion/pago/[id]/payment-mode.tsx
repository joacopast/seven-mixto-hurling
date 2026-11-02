"use client";

import { useState } from "react";
import { Button, Card, ButtonLink } from "@/components/ui";
import { formatArs } from "@/lib/tournament/pricing";
import { buildWhatsAppLink } from "@/lib/tournament/whatsapp";

type Mode = "total" | "sena";

export function PaymentModeCard({
  teamName,
  totalAmount,
  whatsappPhone,
  whatsappTemplate,
}: {
  teamName: string;
  totalAmount: number;
  whatsappPhone: string | null;
  whatsappTemplate: string;
}) {
  const [mode, setMode] = useState<Mode>("total");
  const [senaPesos, setSenaPesos] = useState("");

  const totalPesos = Math.round(totalAmount / 100);
  const senaMinPesos = Math.ceil(totalPesos * 0.5);
  const senaValue = Number(senaPesos);
  const senaTyped = senaPesos.trim() !== "" && Number.isFinite(senaValue);
  const senaValid = senaTyped && senaValue >= senaMinPesos && senaValue < totalPesos;
  const senaBelowMin = senaTyped && senaValue < senaMinPesos;

  const amountForMessage =
    mode === "total"
      ? formatArs(totalAmount).replace("$", "")
      : senaValid
        ? senaValue.toLocaleString("es-AR")
        : "seña a confirmar";

  const whatsappLink = buildWhatsAppLink(whatsappPhone, whatsappTemplate, {
    team: teamName,
    amount: amountForMessage,
  });

  const sendBlocked = mode === "sena" && senaBelowMin;

  return (
    <>
      <Card className="mt-4">
        <h2 className="font-display text-lg font-semibold text-paper">¿Cómo querés pagar?</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("total")}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
              mode === "total"
                ? "border-accent bg-accent-wash text-accent"
                : "border-line text-ink-soft hover:bg-surface-2"
            }`}
          >
            <span className="block font-semibold">Pagar el total</span>
            <span className="block text-xs text-ink-faint">
              {formatArs(totalAmount)} · queda confirmado al toque
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("sena")}
            className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
              mode === "sena"
                ? "border-accent bg-accent-wash text-accent"
                : "border-line text-ink-soft hover:bg-surface-2"
            }`}
          >
            <span className="block font-semibold">Pagar una seña</span>
            <span className="block text-xs text-ink-faint">Reservás el lugar y completás después</span>
          </button>
        </div>

        {mode === "total" ? (
          <p className="mt-4 text-sm text-ink-soft">
            Transferí exactamente <strong className="text-paper">{formatArs(totalAmount)}</strong> y
            mandanos el comprobante. Tu inscripción queda <strong>confirmada</strong> apenas lo
            verifiquemos.
          </p>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-ink-soft">
              Transferí al menos el <strong className="text-paper">50%</strong> (
              {formatArs(senaMinPesos * 100)}) para reservar tu lugar, y completá el resto más
              adelante. Tu inscripción queda en{" "}
              <strong className="text-paper">seña recibida</strong> hasta que termines de pagar.
            </p>
            <label className="mt-3 block text-xs text-ink-faint">
              ¿Cuánto vas a transferir? (opcional, para avisarle a la organización)
              <input
                type="number"
                min={senaMinPesos}
                max={Math.max(senaMinPesos, totalPesos - 1)}
                value={senaPesos}
                onChange={(e) => setSenaPesos(e.target.value)}
                placeholder={`mínimo ${senaMinPesos.toLocaleString("es-AR")}`}
                className="mt-1 h-11 w-full rounded-lg border border-line bg-surface-3 px-3 text-sm text-ink"
              />
            </label>
            {senaBelowMin && (
              <p className="mt-1.5 text-xs text-danger">
                El mínimo para reservar el lugar es {formatArs(senaMinPesos * 100)} (50%).
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="mt-4">
        {sendBlocked ? (
          <>
            <Button size="lg" className="w-full" disabled>
              Enviar comprobante por WhatsApp
            </Button>
            <p className="mt-2 text-center text-xs text-danger">
              Subí el monto a {formatArs(senaMinPesos * 100)} o más para poder enviar el
              comprobante.
            </p>
          </>
        ) : whatsappLink ? (
          <ButtonLink href={whatsappLink} target="_blank" size="lg" className="w-full">
            Enviar comprobante por WhatsApp
          </ButtonLink>
        ) : (
          <p className="rounded-2xl border border-line border-l-[3px] border-l-warn bg-surface p-4 text-sm text-ink-soft">
            La organización todavía no cargó un WhatsApp de contacto. Escribinos por las redes para
            mandarte el comprobante.
          </p>
        )}
      </div>
    </>
  );
}
