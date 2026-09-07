import { NextResponse, type NextRequest } from "next/server";
import { reconcilePendingPayments } from "@/lib/services/payment";
import { mercadoPagoConfigured } from "@/lib/payments/mercadopago";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reconciliación de pagos: consulta a MP los pagos de inscripciones que quedaron
 * en "pago iniciado" por si se perdió un webhook. Se agenda con Vercel Cron.
 * Protegido por CRON_SECRET (header Authorization: Bearer <secret>).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  if (!mercadoPagoConfigured()) {
    return NextResponse.json({ skipped: "MP no configurado" });
  }

  const result = await reconcilePendingPayments();
  return NextResponse.json({ ok: true, ...result });
}
