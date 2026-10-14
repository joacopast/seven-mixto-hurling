"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { confirmManualPayment, PaymentError } from "@/lib/services/payment";

export interface ConfirmPaymentState {
  ok?: boolean;
  message?: string;
  error?: string;
}

/** Confirma a mano una transferencia ya verificada (ver comprobante por WhatsApp). */
export async function confirmPaymentFromList(
  registrationId: string,
  note: string,
): Promise<ConfirmPaymentState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const res = await confirmManualPayment(registrationId, { note: note || null }, { userId: admin.id, ip });
    revalidatePath("/admin/pagos");
    revalidatePath("/admin");
    revalidatePath("/admin/equipos");
    if (res.outcome === "WAITLISTED_OVERBOOK") {
      return {
        ok: true,
        message: "Ya no había cupo: quedó en lista de espera. Hay que reintegrar la transferencia.",
      };
    }
    return { ok: true, message: res.outcome === "NOOP" ? "Ya estaba confirmado." : "Pago confirmado." };
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
}
