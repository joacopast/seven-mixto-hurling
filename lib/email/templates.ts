import { APP_URL, SITE } from "@/lib/config";
import { formatArs } from "@/lib/tournament/pricing";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament/status";
import type { NotificationType, RegistrationStatus } from "@prisma/client";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Ctx {
  teamName?: string;
  amount?: number;
  expiresAt?: string;
  matchLabel?: string;
  startsAt?: string;
  fieldName?: string;
  extra?: Record<string, unknown>;
}

const GREEN = "#123f2c";
const INK = "#16241a";

function shell(title: string, bodyHtml: string, cta?: { label: string; href: string }): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f4ee;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e2d8">
      <div style="background:${GREEN};padding:20px 24px;color:#f6f3ea">
        <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;opacity:.8">${SITE.name}</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px">${title}</div>
      </div>
      <div style="padding:24px;color:${INK};font-size:15px;line-height:1.6">
        ${bodyHtml}
        ${
          cta
            ? `<p style="margin:24px 0 8px">
                 <a href="${cta.href}" style="background:${GREEN};color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;display:inline-block;font-weight:600">${cta.label}</a>
               </p>`
            : ""
        }
      </div>
      <div style="padding:16px 24px;border-top:1px solid #eee;color:#8a978c;font-size:12px">
        ${SITE.name} · ${SITE.tagline}
      </div>
    </div>
  </div>`;
}

const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Renderiza el email para un tipo de notificación. */
export function renderNotification(type: NotificationType, ctx: Ctx): RenderedEmail {
  const team = ctx.teamName ?? "tu equipo";
  const portal = { label: "Ir al portal del equipo", href: `${APP_URL}/mi-equipo` };
  const tournament = { label: "Ver el torneo", href: `${APP_URL}/torneo` };

  switch (type) {
    case "REGISTRATION_CONFIRMED": {
      const body = `
        <p>Recibimos la inscripción de <strong>${team}</strong>. Todavía falta completar el pago para confirmar el cupo.</p>
        <p>Desde el portal podés pagar, editar el plantel y seguir el torneo.</p>`;
      return { subject: `Inscripción recibida — ${team}`, html: shell("Inscripción recibida", body, portal), text: stripHtml(body) };
    }
    case "PAYMENT_APPROVED": {
      if (ctx.extra?.kind === "deposit") {
        const owed = typeof ctx.extra.owed === "number" ? ctx.extra.owed : undefined;
        const body = `
          <p>Recibimos la seña${ctx.amount ? ` de <strong>${formatArs(ctx.amount)}</strong>` : ""} de <strong>${team}</strong>. Tu lugar queda reservado.</p>
          ${owed ? `<p>Todavía falta abonar <strong>${formatArs(owed)}</strong> para confirmar la inscripción.</p>` : ""}`;
        return { subject: `Seña recibida — ${team}`, html: shell("Seña recibida", body, portal), text: stripHtml(body) };
      }
      const body = `
        <p>El pago${ctx.amount ? ` de <strong>${formatArs(ctx.amount)}</strong>` : ""} de <strong>${team}</strong> se acreditó.</p>
        <p>La inscripción quedó <strong>confirmada</strong>. ¡Nos vemos en la cancha!</p>`;
      return { subject: `Pago acreditado — ${team}`, html: shell("Pago acreditado", body, portal), text: stripHtml(body) };
    }
    case "TEAM_APPROVED": {
      const body = `<p><strong>${team}</strong> ya está confirmado en el torneo. Te avisaremos cuando se publique el fixture.</p>`;
      return { subject: `${team} está adentro`, html: shell("Equipo confirmado", body, portal), text: stripHtml(body) };
    }
    case "WAITLIST_INVITED": {
      const body = `
        <p>¡Se liberó un cupo! <strong>${team}</strong> pasó de la lista de espera y ya podés pagar la inscripción.</p>
        ${ctx.expiresAt ? `<p>Tenés tiempo hasta <strong>${new Date(ctx.expiresAt).toLocaleString("es-AR")}</strong>. Si no se acredita el pago, el cupo pasa al siguiente.</p>` : ""}`;
      return { subject: `Se liberó un cupo — ${team}`, html: shell("Cupo disponible", body, portal), text: stripHtml(body) };
    }
    case "FIXTURE_PUBLISHED": {
      const body = `<p>Ya está publicado el fixture. Consultá el grupo, los horarios y las canchas de <strong>${team}</strong>.</p>`;
      return { subject: "El fixture ya está publicado", html: shell("Fixture publicado", body, portal), text: stripHtml(body) };
    }
    case "MATCH_UPCOMING": {
      const when = ctx.startsAt ? new Date(ctx.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "";
      const body = `<p>Próximo partido de <strong>${team}</strong>${ctx.matchLabel ? `: ${ctx.matchLabel}` : ""}${when ? ` a las <strong>${when}</strong>` : ""}${ctx.fieldName ? ` en ${ctx.fieldName}` : ""}.</p>`;
      return { subject: `Próximo partido — ${team}`, html: shell("Próximo partido", body, portal), text: stripHtml(body) };
    }
    case "TIME_CHANGED": {
      const body = `<p>Cambió el horario de un partido de <strong>${team}</strong>${ctx.startsAt ? `: ahora es a las <strong>${new Date(ctx.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</strong>` : ""}. Revisá el fixture.</p>`;
      return { subject: `Cambio de horario — ${team}`, html: shell("Cambio de horario", body, portal), text: stripHtml(body) };
    }
    case "FIELD_CHANGED": {
      const body = `<p>Cambió la cancha de un partido de <strong>${team}</strong>${ctx.fieldName ? `: ahora juega en <strong>${ctx.fieldName}</strong>` : ""}. Revisá el fixture.</p>`;
      return { subject: `Cambio de cancha — ${team}`, html: shell("Cambio de cancha", body, portal), text: stripHtml(body) };
    }
    case "RESULT_POSTED": {
      const kind = (ctx.extra?.kind as string) ?? "";
      if (kind === "payment_observed") {
        const body = `<p>Detectamos algo en el pago de <strong>${team}</strong> que necesita revisión de la organización. Te contactamos pronto. No pagues de nuevo.</p>`;
        return { subject: `Revisamos tu pago — ${team}`, html: shell("Pago en revisión", body, portal), text: stripHtml(body) };
      }
      if (kind === "payment_refunded") {
        const body = `<p>Se registró la devolución del pago de <strong>${team}</strong>. Si tenés dudas, escribinos.</p>`;
        return { subject: `Devolución registrada — ${team}`, html: shell("Devolución", body, portal), text: stripHtml(body) };
      }
      if (kind === "tournament_finished") {
        const body = `<p>¡Terminó el torneo! Mirá los resultados finales de las cuatro copas.</p>`;
        return { subject: "Terminó el torneo", html: shell("Torneo finalizado", body, tournament), text: stripHtml(body) };
      }
      const body = `<p>Se actualizaron resultados de <strong>${team}</strong>. Mirá la tabla y el fixture.</p>`;
      return { subject: `Resultados actualizados — ${team}`, html: shell("Resultados", body, portal), text: stripHtml(body) };
    }
    case "STATUS_CHANGED": {
      const kind = (ctx.extra?.kind as string) ?? "";
      if (kind === "waitlist_joined") {
        const position = typeof ctx.extra?.position === "number" ? ctx.extra.position : undefined;
        const body = `
          <p>Anotamos a <strong>${team}</strong> en la lista de espera${position ? ` — posición <strong>${position}</strong>` : ""}.</p>
          <p>Te avisamos por acá en cuanto se libere un cupo.</p>`;
        return { subject: `En lista de espera — ${team}`, html: shell("Lista de espera", body, portal), text: stripHtml(body) };
      }
      if (kind === "waitlist_expired") {
        const body = `
          <p>Se venció el tiempo para pagar la inscripción de <strong>${team}</strong> y el cupo volvió a quedar libre.</p>
          <p><strong>${team}</strong> vuelve al final de la lista de espera. Te avisamos de nuevo si se libera otro cupo.</p>`;
        return { subject: `Se venció tu cupo — ${team}`, html: shell("Cupo liberado", body, portal), text: stripHtml(body) };
      }
      const status = ctx.extra?.status as RegistrationStatus | undefined;
      const label = status ? REGISTRATION_STATUS_LABEL[status] : null;
      const reason = typeof ctx.extra?.reason === "string" ? ctx.extra.reason : undefined;
      const body = `
        <p>El estado de la inscripción de <strong>${team}</strong> cambió${label ? ` a <strong>${label}</strong>` : ""}.</p>
        ${reason ? `<p>${reason}</p>` : ""}
        <p>Cualquier duda, revisá el portal o escribinos.</p>`;
      return { subject: `Cambio de estado — ${team}`, html: shell("Cambio de estado", body, portal), text: stripHtml(body) };
    }
    case "ADMIN_ALERT": {
      const title = typeof ctx.extra?.title === "string" ? ctx.extra.title : "Cambio en el torneo";
      const lines = Array.isArray(ctx.extra?.lines) ? (ctx.extra.lines as unknown[]).map(String) : [];
      const teamId = typeof ctx.extra?.teamId === "string" ? ctx.extra.teamId : undefined;
      const body = `
        <p><strong>${title}</strong></p>
        ${
          lines.length
            ? `<ul style="margin:10px 0;padding-left:18px">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`
            : ""
        }`;
      const cta = teamId
        ? { label: "Ver equipo", href: `${APP_URL}/admin/equipos/${teamId}` }
        : { label: "Ir al panel", href: `${APP_URL}/admin` };
      return { subject: title, html: shell(title, body, cta), text: stripHtml(body) };
    }
    default: {
      const body = `<p>Novedades del torneo para <strong>${team}</strong>.</p>`;
      return { subject: `Novedades — ${SITE.name}`, html: shell("Novedades", body, tournament), text: stripHtml(body) };
    }
  }
}
