"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { confirmManualPayment, PaymentError } from "@/lib/services/payment";
import { formatArs } from "@/lib/tournament/pricing";
import { buildNextStepsMessage } from "@/lib/tournament/whatsapp";
import { APP_URL } from "@/lib/config";

export interface ConfirmPaymentState {
  ok?: boolean;
  message?: string;
  whatsappMessage?: string;
  error?: string;
}

/** Confirma a mano una transferencia ya verificada (ver comprobante por WhatsApp). */
export async function confirmPaymentFromList(
  registrationId: string,
  note: string,
  amountPesos?: number,
): Promise<ConfirmPaymentState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const amount = amountPesos ? Math.round(amountPesos * 100) : undefined;
    const res = await confirmManualPayment(
      registrationId,
      { note: note || null, amount },
      { userId: admin.id, ip },
    );
    revalidatePath("/admin/pagos");
    revalidatePath("/admin");
    revalidatePath("/admin/equipos");
    if (res.outcome === "WAITLISTED_OVERBOOK") {
      return {
        ok: true,
        message: "Ya no había cupo: quedó en lista de espera. Hay que reintegrar la transferencia.",
      };
    }
    if (res.outcome === "DEPOSIT_RECORDED") {
      return { ok: true, message: `Seña registrada. Falta ${formatArs(res.amountOwed ?? 0)}.` };
    }
    if (res.outcome === "NOOP") {
      return { ok: true, message: "Ya estaba confirmado." };
    }
    return {
      ok: true,
      message: "Pago confirmado.",
      whatsappMessage: buildNextStepsMessage({
        team: res.teamName ?? "tu equipo",
        portalUrl: `${APP_URL}/mi-equipo`,
      }),
    };
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
}
