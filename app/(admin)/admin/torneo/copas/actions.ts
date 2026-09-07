"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { setCupMatchResult, CupsError } from "@/lib/services/cups";

const schema = z.object({
  matchId: z.string().min(1),
  mode: z.enum(["score", "walkover"]),
  homeScore: z.coerce.number().int().min(0).max(99).optional(),
  awayScore: z.coerce.number().int().min(0).max(99).optional(),
  homeShootout: z.coerce.number().int().min(0).max(99).optional(),
  awayShootout: z.coerce.number().int().min(0).max(99).optional(),
  walkover: z.string().optional(),
  confirmCascade: z
    .union([z.literal("on"), z.literal("true"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export interface CupResultState {
  ok?: boolean;
  error?: string;
  needsCascade?: boolean;
  matchId?: string;
}

export async function saveCupResult(
  _prev: CupResultState,
  formData: FormData,
): Promise<CupResultState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const parsed = schema.safeParse({
    matchId: formData.get("matchId"),
    mode: formData.get("mode"),
    homeScore: formData.get("homeScore") || undefined,
    awayScore: formData.get("awayScore") || undefined,
    homeShootout: formData.get("homeShootout") || undefined,
    awayShootout: formData.get("awayShootout") || undefined,
    walkover: formData.get("walkover") || undefined,
    confirmCascade: formData.get("confirmCascade") || undefined,
  });
  if (!parsed.success) {
    return { error: "Datos inválidos.", matchId: String(formData.get("matchId") ?? "") };
  }

  const d = parsed.data;
  try {
    await setCupMatchResult(
      d.matchId,
      d.mode === "walkover"
        ? { walkover: d.walkover }
        : {
            homeScore: d.homeScore,
            awayScore: d.awayScore,
            homeShootout: d.homeShootout,
            awayShootout: d.awayShootout,
          },
      { confirmCascade: d.confirmCascade },
      { userId: admin.id, ip },
    );
    revalidatePath("/admin/torneo/copas");
    revalidatePath("/admin/torneo");
    revalidatePath("/torneo");
    return { ok: true, matchId: d.matchId };
  } catch (err) {
    if (err instanceof CupsError) {
      return {
        error: err.message,
        needsCascade: err.code === "NEEDS_CASCADE_CONFIRM",
        matchId: d.matchId,
      };
    }
    throw err;
  }
}
