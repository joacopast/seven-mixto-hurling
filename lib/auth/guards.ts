import "server-only";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export class AuthorizationError extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

/** Devuelve el usuario de la sesión o null. No redirige. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    role: session.user.role,
  };
}

/** Exige sesión. Redirige a /ingresar si no hay. Para uso en Server Components. */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = callbackUrl
      ? `/ingresar?callbackUrl=${encodeURIComponent(callbackUrl)}`
      : "/ingresar";
    redirect(target);
  }
  return user;
}

/** Exige un rol específico. Lanza AuthorizationError (para Server Actions) o redirige. */
export async function requireRole(
  role: UserRole,
  opts: { mode?: "throw" | "redirect" } = {},
): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    if (opts.mode === "redirect") redirect("/ingresar");
    throw new AuthorizationError("Necesitás iniciar sesión.");
  }
  if (user.role !== role) {
    if (opts.mode === "redirect") redirect("/");
    throw new AuthorizationError("No tenés permisos para esta acción.");
  }
  return user;
}

/**
 * Verifica que el usuario sea dueño (manager) del equipo, o ADMIN.
 * Server-side siempre — nunca confiar en el frontend.
 */
export async function requireTeamAccess(teamId: string): Promise<{
  user: SessionUser;
  isAdmin: boolean;
}> {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("Necesitás iniciar sesión.");
  if (user.role === "ADMIN") return { user, isAdmin: true };

  const team = await db.team.findUnique({
    where: { id: teamId },
    select: { managerUserId: true },
  });
  if (!team || team.managerUserId !== user.id) {
    throw new AuthorizationError("Este equipo no te pertenece.");
  }
  return { user, isAdmin: false };
}
