import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { authConfig, isAdminEmail } from "@/lib/auth/config";
import { sendMagicLinkEmail } from "@/lib/email/send";

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY ?? "dev-noop",
      from: process.env.EMAIL_FROM ?? "Seven Mixto Hurling <no-reply@localhost>",
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLinkEmail({ to: identifier, url });
      },
    }),
  ],
  events: {
    /**
     * La allowlist ADMIN_EMAILS es la fuente de verdad del rol ADMIN.
     * En cada login se re-sincroniza: quien sale de la allowlist vuelve a TEAM_MANAGER.
     */
    async signIn({ user }) {
      if (!user.email || !user.id) return;
      const targetRole = isAdminEmail(user.email) ? "ADMIN" : "TEAM_MANAGER";
      const current = await db.user.findUnique({
        where: { id: user.id },
        select: { role: true },
      });
      if (current && current.role !== targetRole) {
        await db.user.update({
          where: { id: user.id },
          data: { role: targetRole },
        });
      }
    },
  },
});
