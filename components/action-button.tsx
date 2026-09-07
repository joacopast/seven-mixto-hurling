"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

type Result = { ok?: boolean; message?: string; error?: string };

/** Botón que ejecuta una server action y muestra el resultado inline. */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  confirm,
  className,
}: {
  action: () => Promise<Result>;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  confirm?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={variant}
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          startTransition(async () => setResult(await action()));
        }}
      >
        {pending ? "…" : children}
      </Button>
      {result?.message && <span className="text-xs text-ok">{result.message}</span>}
      {result?.error && <span className="text-xs text-danger">{result.error}</span>}
    </div>
  );
}
