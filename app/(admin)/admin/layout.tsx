import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { SITE } from "@/lib/config";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/equipos", label: "Equipos" },
  { href: "/admin/espera", label: "Lista de espera" },
  { href: "/admin/torneo", label: "Torneo" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/auditoria", label: "Auditoría" },
  { href: "/admin/configuracion", label: "Configuración" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // El panel es solo para staff: sin sesión, al login de staff (no al magic
  // link de responsables de equipo); con sesión pero sin rol ADMIN, al inicio.
  if (!user) redirect("/staff?callbackUrl=/admin");
  if (user.role !== "ADMIN") redirect("/");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="font-display text-lg font-semibold text-accent">
              {SITE.name}
            </Link>
            <span className="font-mono text-xs uppercase tracking-wide text-ink-faint">Panel</span>
          </div>
          <SignOutButton />
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="border-b-2 border-transparent px-3 py-2 text-sm text-ink-soft hover:border-line hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
