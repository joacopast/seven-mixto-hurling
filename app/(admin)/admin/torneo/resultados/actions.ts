"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { setGroupMatchResult, ResultError } from "@/lib/services/results";
import { rescheduleRound, ScheduleError } from "@/lib/services/schedule";

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

export interface RescheduleState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const rescheduleSchema = z.object({
  roundId: z.string().min(1),
  startsAt: z.string().min(1, "Elegí un horario."),
});

export async function rescheduleRoundAction(
  _prev: RescheduleState,
  formData: FormData,
): Promise<RescheduleState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const parsed = rescheduleSchema.safeParse({
    roundId: formData.get("roundId"),
    startsAt: formData.get("startsAt"),
  });
  if (!parsed.success) return { error: "Elegí un horario válido." };

  try {
    const res = await rescheduleRound(parsed.data.roundId, new Date(parsed.data.startsAt), {
      userId: admin.id,
      ip,
    });
    revalidatePath("/admin/torneo/resultados");
    revalidatePath("/admin/torneo/copas");
    revalidatePath("/admin/torneo");
    revalidatePath("/torneo");
    revalidatePath("/mi-equipo");
    if (res.shiftedRounds === 0) {
      return { ok: true, message: "Horario actualizado." };
    }
    return {
      ok: true,
      message: `Horario actualizado. Se corrieron ${res.shiftedRounds} tanda(s) más por el mismo delta y se avisó a ${res.notifiedTeams} equipo(s).`,
    };
  } catch (err) {
    if (err instanceof ScheduleError) return { error: err.message };
    throw err;
  }
}
