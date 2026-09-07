import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { processPaymentWebhook } from "@/lib/services/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Mercado Pago. Idempotente: el mismo evento entra varias veces sin
 * duplicar pagos ni generar inconsistencias (ver lib/services/payment.ts).
 *
 * El estado real del pago SIEMPRE se re-consulta a la API de MP; nunca se
 * confía en el cuerpo de esta request.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await rateLimit(`mp-webhook:${ip}`, { max: 120, windowSec: 60 });
  if (!limited.success) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const url = new URL(req.url);
  const dataFromBody =
    (body.data as { id?: string | number } | undefined)?.id ?? undefined;
  const dataId = String(
    url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? dataFromBody ?? "",
  );
  const topic = String(
    url.searchParams.get("type") ??
      url.searchParams.get("topic") ??
      (body.type as string | undefined) ??
      (body.topic as string | undefined) ??
      "",
  );

  if (!dataId || !topic) {
    // Nada accionable — 200 para que MP no reintente indefinidamente.
    return NextResponse.json({ ok: true, ignored: true });
  }

  const result = await processPaymentWebhook({
    dataId,
    topic,
    xSignature: req.headers.get("x-signature"),
    xRequestId: req.headers.get("x-request-id"),
    rawBody: { query: Object.fromEntries(url.searchParams), body },
  });

  return NextResponse.json(result.body, { status: result.httpStatus });
}
