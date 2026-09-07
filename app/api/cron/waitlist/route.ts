import { NextResponse, type NextRequest } from "next/server";
import { getActiveTournament } from "@/lib/tournament/queries";
import { autoPromoteWaitlist } from "@/lib/services/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Promoción automática de la lista de espera: expira invitaciones vencidas y
 * llena los cupos libres con los primeros de la lista. Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const t = await getActiveTournament();
  const result = await autoPromoteWaitlist(t.id);
  return NextResponse.json({ ok: true, ...result });
}
