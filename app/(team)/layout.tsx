import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { SITE } from "@/lib/config";
import { SignOutButton } from "@/components/sign-out-button";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("/mi-equipo");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="font-display text-lg font-semibold text-accent">
            {SITE.name}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-faint sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
