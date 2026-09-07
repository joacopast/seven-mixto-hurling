import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { REGISTRATION_STATUS_LABEL } from "@/lib/tournament/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Estado de una inscripción por su id (cuid, no adivinable). Se usa para el
 * polling de la pantalla de retorno del checkout. Devuelve solo lo mínimo.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const registration = await db.registration.findUnique({
    where: { id },
    select: { status: true, team: { select: { name: true } } },
  });
  if (!registration) {
    return NextResponse.json({ error: "no encontrada" }, { status: 404 });
  }
  return NextResponse.json({
    status: registration.status,
    statusLabel: REGISTRATION_STATUS_LABEL[registration.status],
    teamName: registration.team?.name ?? null,
  });
}
