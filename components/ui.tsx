import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/* ---------------- Button ---------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-paper text-bg-deep hover:bg-white",
  secondary: "border border-ink/25 text-ink hover:bg-surface-2",
  ghost: "text-ink-soft hover:bg-surface-2",
  danger: "bg-danger text-bg-deep hover:opacity-90",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-sm",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

interface ButtonLinkProps extends React.ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)}
      {...props}
    />
  );
}

/* ---------------- Card ---------------- */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-line-soft bg-surface p-5", className)}
      {...props}
    />
  );
}

/* ---------------- Badge ---------------- */

type BadgeTone = "neutral" | "ok" | "warn" | "danger" | "info" | "accent" | "pop";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-2 text-ink-soft",
  ok: "border-transparent bg-ok/15 text-ok",
  warn: "border-transparent bg-warn/15 text-warn",
  danger: "border-transparent bg-danger/15 text-danger",
  info: "border-transparent bg-info/15 text-info",
  accent: "border-transparent bg-accent-wash text-accent",
  pop: "border-transparent bg-pop/15 text-pop-soft",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider",
        badgeTones[tone],
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Form fields ---------------- */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-faint">{hint}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// text-base (16px) en mobile evita el auto-zoom de iOS Safari al enfocar un campo;
// sm:text-sm vuelve al tamaño compacto en desktop/tablet.
const inputBase =
  "h-10 w-full rounded-xl border border-line bg-surface-3 px-3 text-base text-ink placeholder:text-ink-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent disabled:opacity-50 sm:text-sm";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputBase, className)} {...props} />;
  },
);

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(inputBase, "pr-8", className)} {...props} />;
});

/* ---------------- Callout ---------------- */

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "ok";
  title?: string;
  children: React.ReactNode;
}) {
  const border =
    tone === "warn" ? "border-l-warn" : tone === "ok" ? "border-l-ok" : "border-l-accent";
  return (
    <div
      className={cn(
        "rounded-2xl border border-line-soft border-l-[3px] bg-surface p-4 text-sm",
        border,
      )}
    >
      {title && <p className="mb-1 font-semibold text-ink">{title}</p>}
      <div className="text-ink-soft">{children}</div>
    </div>
  );
}

/* ---------------- Marca ---------------- */

/** Trofeo del torneo (logo oficial), en /public/logo-seven.png. */
export function Crest({ className = "h-8 w-auto" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- ícono chico, no necesita next/image
  return <img src="/logo-seven.png" alt="" aria-hidden className={className} />;
}
