import "server-only";
import crypto from "node:crypto";
import { APP_URL } from "@/lib/config";

/**
 * Cliente de Mercado Pago (Checkout Pro) — llamadas REST directas.
 * Nunca se guardan datos de tarjeta. El estado real del pago SIEMPRE se
 * re-consulta a este cliente desde el backend; nunca se confía en el body
 * del webhook ni en el retorno del navegador.
 *
 * Env:
 *   MP_ACCESS_TOKEN   — token privado (server-side)
 *   MP_WEBHOOK_SECRET — clave para validar la firma de los webhooks
 */

const MP_API = "https://api.mercadopago.com";

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

function accessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    throw new MercadoPagoError(
      "MP_ACCESS_TOKEN no configurado. Completá las credenciales de Mercado Pago.",
    );
  }
  return token;
}

export function mercadoPagoConfigured(): boolean {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

async function mpFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const { idempotencyKey, ...rest } = init;
  const res = await fetch(`${MP_API}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...rest.headers,
    },
    cache: "no-store",
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new MercadoPagoError(
      `Mercado Pago ${path} respondió ${res.status}`,
      res.status,
      json,
    );
  }
  return json as T;
}

/* ---------------- Preferencia (checkout) ---------------- */

export interface CreatePreferenceInput {
  /** Identificador propio de la inscripción; MP lo propaga al pago. */
  externalReference: string;
  /** Monto total en pesos (no centavos). */
  amount: number;
  currency: string;
  description: string;
  payerEmail?: string;
  /** URL base a la que MP redirige al terminar; se le agrega ?status=. */
  returnUrl: string;
  notificationUrl: string;
}

export interface MpPreference {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}

export async function createPreference(input: CreatePreferenceInput): Promise<MpPreference> {
  return mpFetch<MpPreference>("/checkout/preferences", {
    method: "POST",
    idempotencyKey: input.externalReference,
    body: JSON.stringify({
      items: [
        {
          id: input.externalReference,
          title: input.description,
          quantity: 1,
          unit_price: input.amount,
          currency_id: input.currency,
        },
      ],
      external_reference: input.externalReference,
      payer: input.payerEmail ? { email: input.payerEmail } : undefined,
      back_urls: {
        success: `${input.returnUrl}?status=success`,
        failure: `${input.returnUrl}?status=failure`,
        pending: `${input.returnUrl}?status=pending`,
      },
      auto_return: "approved",
      notification_url: input.notificationUrl,
      binary_mode: false,
      statement_descriptor: "SEVEN MIXTO",
    }),
  });
}

/* ---------------- Pago ---------------- */

export type MpPaymentStatus =
  | "approved"
  | "pending"
  | "in_process"
  | "in_mediation"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";

export interface MpPayment {
  id: number;
  status: MpPaymentStatus;
  status_detail: string;
  transaction_amount: number;
  currency_id: string;
  external_reference: string | null;
  payer?: { email?: string };
  date_approved: string | null;
}

export async function getPayment(paymentId: string | number): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${paymentId}`);
}

/** Busca pagos por external_reference (usado en la reconciliación). */
export async function searchPaymentsByReference(ref: string): Promise<MpPayment[]> {
  const q = new URLSearchParams({
    external_reference: ref,
    sort: "date_created",
    criteria: "desc",
  });
  const r = await mpFetch<{ results?: MpPayment[] }>(`/v1/payments/search?${q.toString()}`);
  return r.results ?? [];
}

/* ---------------- Webhook ---------------- */

/**
 * Valida la firma `x-signature` de un webhook de Mercado Pago.
 * Manifest: `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`
 * Devuelve true también cuando no hay secreto configurado (solo dev) —
 * en ese caso se registra una advertencia en el llamador.
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
}): { valid: boolean; reason?: string; skipped?: boolean } {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return { valid: true, skipped: true };

  const { xSignature, xRequestId, dataId } = params;
  if (!xSignature) return { valid: false, reason: "falta x-signature" };

  const parts = Object.fromEntries(
    xSignature.split(",").map((kv) => {
      const [k, v] = kv.split("=");
      return [k?.trim(), v?.trim()];
    }),
  ) as { ts?: string; v1?: string };

  if (!parts.ts || !parts.v1) return { valid: false, reason: "x-signature malformado" };

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId ?? ""};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { valid, reason: valid ? undefined : "firma no coincide" };
}

/* ---------------- URLs ---------------- */

export function webhookUrl(): string {
  return `${APP_URL}/api/webhooks/mercadopago`;
}

export function paymentReturnUrl(registrationId: string): string {
  return `${APP_URL}/inscripcion/pago/${registrationId}`;
}
