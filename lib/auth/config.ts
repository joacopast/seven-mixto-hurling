import type { NextAuthConfig } from "next-auth";

/**
 * Configuración base de Auth.js — sin adapter ni providers con dependencias de Node.
 * Este objeto se usa también desde middleware.ts (runtime edge), por eso debe
 * quedar libre de imports `server-only`, Prisma o Node APIs.
 *
 * El provider real (magic link por email vía Resend) y el Prisma adapter se
 * agregan en lib/auth/index.ts, que corre en runtime Node.
 */

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails.includes(email.toLowerCase());
}

export const authConfig = {
  providers: [],
  pages: {
    signIn: "/ingresar",
    verifyRequest: "/ingresar/revisa-tu-email",
    error: "/ingresar/error",
  },
  session: { strategy: "database" },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role?: "ADMIN" | "TEAM_MANAGER" }).role ?? "TEAM_MANAGER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
