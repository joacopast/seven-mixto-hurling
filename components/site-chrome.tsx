import Link from "next/link";
import { SITE } from "@/lib/config";
import { getSessionUser } from "@/lib/auth/guards";
import { Crest } from "@/components/ui";

function Wordmark() {
  return (
    <Link href="/" className="flex flex-none items-center gap-2 text-paper">
      <Crest className="h-7 w-7 sm:h-8 sm:w-8" />
      <span className="whitespace-nowrap font-display text-base font-semibold uppercase tracking-[0.12em] leading-none sm:text-lg sm:tracking-[0.14em]">
        Seven Mixto
      </span>
    </Link>
  );
}

export async function SiteHeader() {
  const user = await getSessionUser();
  return (
    <header className="sticky top-0 z-30 border-b border-line-soft bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-0.5 text-sm sm:gap-1">
          <Link href="/torneo" className="rounded-full px-2 py-2 text-ink-soft hover:text-ink sm:px-3">
            Torneo
          </Link>
          <Link
            href="/reglamento"
            className="hidden rounded-full px-2 py-2 text-ink-soft hover:text-ink sm:inline sm:px-3"
          >
            Reglamento
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="rounded-full px-2 py-2 text-ink-soft hover:text-ink sm:px-3">
              Panel
            </Link>
          )}
          {user ? (
            <Link
              href="/mi-equipo"
              className="rounded-full bg-paper px-4 py-2 font-semibold text-bg-deep hover:bg-white"
            >
              Mi equipo
            </Link>
          ) : (
            <Link
              href="/inscripcion"
              className="rounded-full bg-paper px-4 py-2 font-semibold text-bg-deep hover:bg-white"
            >
              Inscribirse
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line-soft bg-bg-deep">
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-faint sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-ink-soft">
            <Crest className="h-6 w-6" />
            <span className="font-display uppercase tracking-[0.14em]">Seven Mixto</span>
          </div>
          <div className="flex gap-5">
            <Link href="/reglamento" className="hover:text-ink">Reglamento</Link>
            <Link href="/torneo" className="hover:text-ink">Torneo</Link>
            <Link href="/ingresar" className="hover:text-ink">Ingresar</Link>
          </div>
        </div>
        <p className="mt-4 text-xs text-ink-faint">{SITE.tagline}</p>
      </div>
    </footer>
  );
}
