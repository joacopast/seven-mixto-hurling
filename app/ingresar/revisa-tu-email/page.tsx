import Link from "next/link";

export const metadata = { title: "Revisá tu email", robots: { index: false } };

export default function VerifyRequestPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-semibold text-ink">Revisá tu email</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        Te enviamos un enlace de acceso. Abrilo desde este mismo dispositivo. Es válido por 24 horas.
      </p>
      <Link href="/" className="mt-6 text-sm text-accent underline">
        Volver al inicio
      </Link>
    </div>
  );
}
