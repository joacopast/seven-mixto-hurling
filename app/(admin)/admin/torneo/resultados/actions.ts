"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { setGroupMatchResult, ResultError } from "@/lib/services/results";

const schema = z.object({
  matchId: z.string().min(1),
  mode: z.enum(["score", "walkover"]),
  homeScore: z.coerce.number().int().min(0).max(99).optional(),
  awayScore: z.coerce.number().int().min(0).max(99).optional(),
  walkover: z.string().optional(),
  notes: z.string().trim().max(300).optional(),
});

export interface ResultState {
  ok?: boolean;
  error?: string;
  matchId?: string;
}

export async function saveResult(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const parsed = schema.safeParse({
    matchId: formData.get("matchId"),
    mode: formData.get("mode"),
    homeScore: formData.get("homeScore") || undefined,
    awayScore: formData.get("awayScore") || undefined,
    walkover: formData.get("walkover") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: "Datos inválidos.", matchId: String(formData.get("matchId") ?? "") };
  }

  try {
    await setGroupMatchResult(
      parsed.data.matchId,
      parsed.data.mode === "walkover"
        ? { walkover: parsed.data.walkover ?? "NONE", notes: parsed.data.notes }
        : { homeScore: parsed.data.homeScore, awayScore: parsed.data.awayScore, notes: parsed.data.notes },
      { userId: admin.id, ip },
    );
    revalidatePath("/admin/torneo/resultados");
    revalidatePath("/admin/torneo");
    revalidatePath("/torneo");
    return { ok: true, matchId: parsed.data.matchId };
  } catch (err) {
    if (err instanceof ResultError) return { error: err.message, matchId: parsed.data.matchId };
    throw err;
  }
}
