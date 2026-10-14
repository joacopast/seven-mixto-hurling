"use client";

import { useState } from "react";

export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line-soft py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
        <p className="truncate font-mono text-sm text-paper">{value}</p>
      </div>
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
        className="flex-none rounded-full border border-line px-3 py-1 text-xs text-ink-soft hover:bg-surface-2"
      >
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
