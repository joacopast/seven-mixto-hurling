"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/guards";
import { playerSchema } from "@/lib/validation/registration";
import { updateMyPlayer, RosterSelfError } from "@/lib/services/roster-self";

export interface EditPlayerState {
  ok?: boolean;
  error?: string;
}

export async function updateMyPlayerAction(
  playerId: string,
  _prev: EditPlayerState,
  formData: FormData,
): Promise<EditPlayerState> {
  const user = await requireUser("/mi-equipo");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const raw = {
    ...Object.fromEntries(formData.entries()),
    isPlayer: formData.get("isPlayer") === "on",
    attendsParty: formData.get("attendsParty") === "on",
    playsHockey: formData.get("playsHockey") === "true",
  };
  const parsed = playerSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos cargados." };
  }

  try {
    await updateMyPlayer(playerId, user.id, parsed.data, { ip });
    revalidatePath("/mi-equipo");
    return { ok: true };
  } catch (err) {
    if (err instanceof RosterSelfError) return { error: err.message };
    throw err;
  }
}
