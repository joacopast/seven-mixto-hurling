"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { RegistrationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import { adminCreateTeam } from "@/lib/services/admin-teams";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: z.string().trim().max(20).optional(),
  clubTag: z.string().trim().max(40).optional(),
  contactName: z.string().trim().min(1).max(80),
  contactEmail: z.string().trim().toLowerCase().email(),
  contactPhone: z.string().trim().min(1).max(30),
  registrationStatus: z.nativeEnum(RegistrationStatus),
  adminNotes: z.string().trim().max(500).optional(),
});

export interface NewTeamState {
  error?: string;
}

export async function createTeam(_prev: NewTeamState, formData: FormData): Promise<NewTeamState> {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revisá los datos." };

  const t = await getActiveTournament();
  const team = await adminCreateTeam(
    { tournamentId: t.id, ...parsed.data },
    { userId: admin.id, ip },
  );
  revalidatePath("/admin/equipos");
  revalidatePath("/admin");
  redirect(`/admin/equipos/${team.id}`);
}
