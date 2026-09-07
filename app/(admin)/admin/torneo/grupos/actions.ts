"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { saveGroupAssignment, GroupsError } from "@/lib/services/groups";

const schema = z.object({
  groupCount: z.coerce.number().int().min(1).max(26),
  // pares "teamId:groupIndex"
  assignments: z.array(z.string().regex(/^.+:\d+$/)),
});

export interface SaveGroupsState {
  ok?: boolean;
  message?: string;
  error?: string;
}

export async function saveGroups(
  _prev: SaveGroupsState,
  formData: FormData,
): Promise<SaveGroupsState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const parsed = schema.safeParse({
    groupCount: formData.get("groupCount"),
    assignments: formData.getAll("assignment"),
  });
  if (!parsed.success) return { error: "Datos inválidos." };

  const t = await getActiveTournament();
  const buckets: string[][] = Array.from({ length: parsed.data.groupCount }, () => []);
  for (const pair of parsed.data.assignments) {
    const idx = pair.lastIndexOf(":");
    const teamId = pair.slice(0, idx);
    const groupIndex = Number(pair.slice(idx + 1));
    if (groupIndex >= 0 && groupIndex < buckets.length) buckets[groupIndex]!.push(teamId);
  }

  try {
    await saveGroupAssignment(t.id, buckets, { userId: admin.id, ip });
    revalidatePath("/admin/torneo");
    revalidatePath("/admin/torneo/grupos");
    revalidatePath("/torneo");
    return { ok: true, message: "Grupos guardados." };
  } catch (err) {
    if (err instanceof GroupsError) return { error: err.message };
    throw err;
  }
}
