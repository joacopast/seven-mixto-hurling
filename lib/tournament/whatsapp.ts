/**
 * Enlace de WhatsApp para enviar el comprobante de transferencia — función pura.
 * Ver docs/arquitectura.html — Flujo de pago (transferencia manual).
 */

/** Deja solo dígitos (WhatsApp requiere el número en formato internacional sin "+"). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export interface WhatsAppMessageVars {
  team: string;
  amount: string;
}

/** Reemplaza {team} y {amount} en la plantilla del mensaje. */
export function renderWhatsAppMessage(template: string, vars: WhatsAppMessageVars): string {
  return template.replace(/\{team\}/g, vars.team).replace(/\{amount\}/g, vars.amount);
}

/**
 * Arma el link wa.me con el texto precargado. Si no hay número configurado,
 * devuelve null (el llamador decide qué mostrar en ese caso).
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  template: string,
  vars: WhatsAppMessageVars,
): string | null {
  const digits = phone ? normalizePhone(phone) : "";
  if (!digits) return null;
  const text = renderWhatsAppMessage(template, vars);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export interface NextStepsMessageVars {
  team: string;
  portalUrl: string;
}

/**
 * Mensaje de "próximos pasos" que el admin copia y pega en WhatsApp al
 * confirmar el pago de un equipo — pensado para prevenir las preguntas
 * básicas más comunes (cómo entro, dónde veo el plantel/grupo/horarios).
 */
export function buildNextStepsMessage({ team, portalUrl }: NextStepsMessageVars): string {
  return [
    `¡Hola! Te confirmamos que el pago de ${team} quedó acreditado y el equipo está inscripto en el Seven Mixto 🏑`,
    "",
    `Desde acá podés ver todo lo de tu equipo: ${portalUrl}`,
    "",
    "Para entrar, poné el mismo mail con el que se inscribieron: les va a llegar un link para ingresar, no hace falta contraseña.",
    "",
    "Desde el portal pueden:",
    "• Ver y editar el plantel",
    "• Ver el grupo, los horarios y la cancha de cada partido (cuando se publique el fixture)",
    "• Seguir los resultados del torneo",
    "",
    "Cualquier duda, escribinos por acá.",
  ].join("\n");
}
