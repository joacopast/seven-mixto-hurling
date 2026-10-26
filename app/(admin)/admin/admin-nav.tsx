"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE } from "@/lib/config";

const NAV = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/equipos", label: "Equipos" },
  { href: "/admin/espera", label: "Lista de espera" },
  { href: "/admin/torneo", label: "Torneo" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/admin/configuracion", label: "Configuración" },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Header + nav del panel de staff: fila de links en desktop, menú hamburguesa en mobile. */
export function AdminNav({ signOutSlot }: { signOutSlot: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Cierra el menú al cambiar de página.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/admin" className="font-display text-lg font-semibold text-accent">
            {SITE.name}
          </Link>
          <span className="hidden font-mono text-xs uppercase tracking-wide text-ink-faint sm:inline">
            Panel
          </span>
        </div>
        <div className="flex items-center gap-2">
          {signOutSlot}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            className="flex h-11 w-11 flex-none items-center justify-center rounded-md border border-line text-ink-soft hover:bg-surface-2 md:hidden"
          >
            {open ? (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Desktop: fila horizontal siempre visible. */}
      <nav className="mx-auto hidden max-w-6xl gap-1 px-4 sm:px-6 md:flex">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`border-b-2 px-3 py-2 text-sm ${
              isActive(pathname, item.href)
                ? "border-accent text-paper"
                : "border-transparent text-ink-soft hover:border-line hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile: panel desplegable. */}
      {open && (
        <nav className="flex flex-col gap-1 border-t border-line px-4 py-2 sm:px-6 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-3 text-base ${
                isActive(pathname, item.href)
                  ? "bg-accent-wash text-accent"
                  : "text-ink-soft hover:bg-surface-2"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
