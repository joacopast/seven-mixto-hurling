"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { configFormSchema } from "@/lib/validation/config";
import { updateTournamentConfig, ConfigError } from "@/lib/services/config";

export interface ConfigState {
  ok?: boolean;
  error?: string;
  warnings?: string[];
  fieldErrors?: Record<string, string>;
}

export async function saveConfig(_prev: ConfigState, formData: FormData): Promise<ConfigState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const raw = {
    ...Object.fromEntries(formData.entries()),
    thirdPlaceMatch: formData.get("thirdPlaceMatch") === "on",
    tiebreakers: formData.getAll("tiebreakers"),
  };

  const parsed = configFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    return { error: "Revisá los campos marcados.", fieldErrors };
  }

  try {
    const t = await getActiveTournament();
    const { warnings } = await updateTournamentConfig(t.id, parsed.data, { userId: admin.id, ip });
    revalidatePath("/admin/configuracion");
    revalidatePath("/admin");
    revalidatePath("/");
    revalidatePath("/torneo");
    revalidatePath("/reglamento");
    return { ok: true, warnings };
  } catch (err) {
    if (err instanceof ConfigError) return { error: err.message };
    console.error("saveConfig", err);
    return { error: "No se pudo guardar. Probá de nuevo." };
  }
}
