import Link from "next/link";

export const metadata = { title: "Error de acceso", robots: { index: false } };

export default function AuthErrorPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">No pudimos validar el acceso</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        El enlace puede haber expirado o ya haber sido usado. Pedí uno nuevo.
      </p>
      <Link
        href="/ingresar"
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-contrast"
      >
        Pedir otro enlace
      </Link>
    </div>
  );
}
