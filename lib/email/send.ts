import "server-only";
import nodemailer from "nodemailer";

/**
 * Envío de emails por SMTP (ej. Gmail con contraseña de aplicación — no
 * requiere dominio propio, a diferencia de un proveedor como Resend).
 * Sin SMTP_USER/SMTP_PASS (desarrollo) el magic link se imprime en consola.
 */

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_PORT ?? "465") === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "Seven Mixto Hurling <no-reply@localhost>";

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.info(
      `\n[email:dev] Para: ${to}\n[email:dev] Asunto: ${subject}\n[email:dev] ${text}\n`,
    );
    return;
  }

  await getTransporter().sendMail({ from, to, subject, html, text });
}

export async function sendMagicLinkEmail({ to, url }: { to: string; url: string }): Promise<void> {
  const subject = "Tu acceso a Seven Mixto Hurling";
  const text = `Ingresá a tu cuenta con este enlace (válido por 24 h):\n\n${url}\n\nSi no lo solicitaste, ignorá este mensaje.`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;color:#1a3626">
      <h1 style="font-size:20px">Seven Mixto Hurling</h1>
      <p>Ingresá a tu cuenta con este botón (válido por 24 horas):</p>
      <p style="margin:24px 0">
        <a href="${url}" style="background:#245236;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">
          Ingresar
        </a>
      </p>
      <p style="font-size:13px;color:#5f7a68">Si no lo solicitaste, ignorá este mensaje.</p>
    </div>`;
  await sendEmail({ to, subject, html, text });
}
