import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { staffAuthConfigured } from "@/lib/auth/staff";
import { StaffLoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acceso staff", robots: { index: false } };

const DEV_CREDS_VISIBLE =
  process.env.NODE_ENV !== "production" && !process.env.STAFF_PASSWORD && !process.env.STAFF_PASSWORD_HASH;

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const user = await getSessionUser();
  if (user?.role === "ADMIN") {
    redirect(callbackUrl?.startsWith("/admin") ? callbackUrl : "/admin");
  }

  const configured = staffAuthConfigured();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-16">
      <Link href="/" className="font-display text-xl font-semibold uppercase tracking-wide text-paper">
        Seven Mixto
      </Link>
      <div className="mt-8 w-full max-w-sm rounded-card border border-line-soft bg-surface p-6">
        <p className="eyebrow">Panel de organización</p>
        <h1 className="mt-2 font-display text-2xl font-semibold text-paper">Acceso del staff</h1>
        <p className="mt-1 text-sm text-ink-soft">Solo para el equipo organizador del torneo.</p>

        {configured ? (
          <StaffLoginForm callbackUrl={callbackUrl} />
        ) : (
          <p className="mt-6 rounded-2xl border border-line border-l-[3px] border-l-warn bg-surface-2 p-4 text-sm text-ink-soft">
            El acceso de staff todavía no está configurado en este entorno. Definí{" "}
            <code>STAFF_USERNAME</code> y <code>STAFF_PASSWORD_HASH</code> (o{" "}
            <code>STAFF_PASSWORD</code>) en las variables de entorno.
          </p>
        )}

        {DEV_CREDS_VISIBLE && (
          <p className="mt-4 rounded-xl bg-pill px-3 py-2 font-mono text-[11px] text-ink-soft">
            Modo desarrollo — usuario <b className="text-paper">admin</b> · contraseña{" "}
            <b className="text-paper">admin</b>
          </p>
        )}
      </div>
      <p className="mt-6 text-sm text-ink-faint">
        ¿Sos responsable de un equipo?{" "}
        <Link href="/ingresar" className="text-accent underline">
          Ingresá acá
        </Link>
      </p>
    </div>
  );
}
