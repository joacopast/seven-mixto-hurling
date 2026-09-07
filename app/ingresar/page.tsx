import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Ingresar",
  robots: { index: false },
};

export default async function IngresarPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(callbackUrl?.startsWith("/") ? callbackUrl : "/mi-equipo");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-16">
      <Link href="/" className="font-display text-xl font-semibold text-accent">
        Seven Mixto Hurling
      </Link>
      <div className="mt-8 w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-ink">Ingresá a tu cuenta</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Te enviamos un enlace de acceso por email. Sin contraseñas.
        </p>
        <LoginForm callbackUrl={callbackUrl} />
      </div>
      <p className="mt-6 text-sm text-ink-faint">
        ¿Todavía no inscribiste tu equipo?{" "}
        <Link href="/inscripcion" className="text-accent underline">
          Empezá acá
        </Link>
      </p>
    </div>
  );
}
