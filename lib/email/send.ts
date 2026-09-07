import "server-only";

/**
 * Envío de emails. Fase 1: magic link de login.
 * Sin RESEND_API_KEY (desarrollo) el magic link se imprime en consola.
 * La arquitectura de notificaciones de dominio (confirmación, pago, fixture…)
 * se implementa en la Fase 6 sobre esta misma capa.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Seven Mixto Hurling <no-reply@localhost>";

  if (!apiKey) {
    console.info(
      `\n[email:dev] Para: ${to}\n[email:dev] Asunto: ${subject}\n[email:dev] ${text}\n`,
    );
    return;
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend respondió ${res.status}: ${body}`);
  }
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
