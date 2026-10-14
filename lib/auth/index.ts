import NextAuth from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
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
    // El transporte real (SMTP) vive en lib/email/send.ts; sendVerificationRequest
    // lo reemplaza por completo — `server` solo satisface la validación del provider.
    Nodemailer({
      server: {
        host: process.env.SMTP_HOST ?? "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT ?? 465),
        auth: { user: process.env.SMTP_USER ?? "dev-noop", pass: process.env.SMTP_PASS ?? "dev-noop" },
      },
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
