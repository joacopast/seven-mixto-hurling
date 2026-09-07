"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { createCheckoutForRegistration, PaymentError } from "@/lib/services/payment";
import { MercadoPagoError } from "@/lib/payments/mercadopago";

export interface StartCheckoutResult {
  ok: boolean;
  checkoutUrl?: string;
  error?: string;
  code?: string;
}

export async function startCheckout(registrationId: string): Promise<StartCheckoutResult> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const limited = await rateLimit(`checkout:${ip ?? "unknown"}`, { max: 10, windowSec: 300 });
  if (!limited.success) {
    return { ok: false, error: "Demasiados intentos. Esperá unos minutos." };
  }

  if (typeof registrationId !== "string" || registrationId.length < 10) {
    return { ok: false, error: "Inscripción inválida." };
  }

  try {
    const result = await createCheckoutForRegistration(registrationId, { ip });
    return { ok: true, checkoutUrl: result.checkoutUrl };
  } catch (err) {
    if (err instanceof PaymentError) {
      return { ok: false, error: err.message, code: err.code };
    }
    if (err instanceof MercadoPagoError) {
      return {
        ok: false,
        error: "El pago con Mercado Pago todavía no está habilitado. Te avisamos por email en cuanto puedas abonar.",
        code: "MP_NOT_CONFIGURED",
      };
    }
    console.error("startCheckout", err);
    return { ok: false, error: "No pudimos iniciar el pago. Probá de nuevo." };
  }
}
