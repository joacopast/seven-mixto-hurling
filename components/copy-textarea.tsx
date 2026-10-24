"use client";

import { useState } from "react";

/** Textarea de solo lectura con botón "Copiar" — para mensajes largos (ej. WhatsApp). */
export function CopyTextarea({ value, rows = 9 }: { value: string; rows?: number }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        readOnly
        rows={rows}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-y rounded-xl border border-line bg-surface-3 p-3 font-mono text-xs leading-relaxed text-ink"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* el navegador puede bloquear el portapapeles; no es crítico */
          }
        }}
        className="self-start rounded-full border border-line px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-2"
      >
        {copied ? "Copiado ✓" : "Copiar mensaje"}
      </button>
    </div>
  );
}
