import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { SignOutButton } from "@/components/sign-out-button";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // El panel es solo para staff: sin sesión, al login de staff (no al magic
  // link de responsables de equipo); con sesión pero sin rol ADMIN, al inicio.
  if (!user) redirect("/staff?callbackUrl=/admin");
  if (user.role !== "ADMIN") redirect("/");
  return (
    <div className="flex min-h-dvh flex-col">
      <AdminNav signOutSlot={<SignOutButton />} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
