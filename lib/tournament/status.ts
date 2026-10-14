import type { RegistrationStatus } from "@prisma/client";

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  DRAFT: "Borrador",
  PENDING_PAYMENT: "Pendiente de pago",
  PAYMENT_STARTED: "Pago iniciado",
  DEPOSIT_PAID: "Seña pagada",
  PAYMENT_APPROVED: "Pago aprobado",
  CONFIRMED: "Inscripción confirmada",
  PAYMENT_REJECTED: "Pago rechazado",
  OBSERVED: "Inscripción observada",
  CANCELLED: "Inscripción cancelada",
  WAITLISTED: "En lista de espera",
};

export type StatusTone = "neutral" | "ok" | "warn" | "danger" | "info";

export const REGISTRATION_STATUS_TONE: Record<RegistrationStatus, StatusTone> = {
  DRAFT: "neutral",
  PENDING_PAYMENT: "warn",
  PAYMENT_STARTED: "info",
  DEPOSIT_PAID: "warn",
  PAYMENT_APPROVED: "ok",
  CONFIRMED: "ok",
  PAYMENT_REJECTED: "danger",
  OBSERVED: "danger",
  CANCELLED: "danger",
  WAITLISTED: "info",
};
