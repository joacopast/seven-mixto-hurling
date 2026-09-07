import type { PaymentStatus } from "@prisma/client";
import type { MpPaymentStatus } from "@/lib/payments/mercadopago";

/** Traduce el estado de Mercado Pago al enum interno de Payment. */
export function mapMpStatus(s: MpPaymentStatus): PaymentStatus {
  switch (s) {
    case "approved":
      return "APPROVED";
    case "pending":
      return "PENDING";
    case "in_process":
    case "in_mediation":
      return "IN_PROCESS";
    case "rejected":
      return "REJECTED";
    case "cancelled":
      return "CANCELLED";
    case "refunded":
    case "charged_back":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}
