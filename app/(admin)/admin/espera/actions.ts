"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { promoteWaitlistEntry, autoPromoteWaitlist } from "@/lib/services/waitlist";

export interface WaitlistActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}

export async function promoteEntry(registrationId: string): Promise<WaitlistActionState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  try {
    await promoteWaitlistEntry(registrationId, { userId: admin.id, ip });
    revalidatePath("/admin/espera");
    revalidatePath("/admin");
    return { ok: true, message: "Equipo invitado. Tiene la ventana de pago configurada." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo promover." };
  }
}

export async function runAutoPromote(): Promise<WaitlistActionState> {
  await requireRole("ADMIN");
  const t = await getActiveTournament();
  const res = await autoPromoteWaitlist(t.id);
  revalidatePath("/admin/espera");
  revalidatePath("/admin");
  return {
    ok: true,
    message: `${res.promoted} promovidos · ${res.expired} invitaciones vencidas.`,
  };
}
