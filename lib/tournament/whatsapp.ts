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
