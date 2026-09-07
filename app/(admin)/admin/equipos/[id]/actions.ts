"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RegistrationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/services/audit";

const schema = z.object({
  teamId: z.string().min(1),
  status: z.nativeEnum(RegistrationStatus),
  reason: z.string().trim().max(300).optional(),
});

export interface StatusChangeState {
  ok?: boolean;
  error?: string;
}

/** Derivación de paymentStatus cache según el estado de inscripción. */
function derivePaymentCache(status: RegistrationStatus) {
  switch (status) {
    case "PAYMENT_APPROVED":
    case "CONFIRMED":
      return "APPROVED" as const;
    case "PAYMENT_REJECTED":
      return "REJECTED" as const;
    case "PENDING_PAYMENT":
    case "PAYMENT_STARTED":
      return "PENDING" as const;
    default:
      return "NONE" as const;
  }
}

export async function changeRegistrationStatus(
  _prev: StatusChangeState,
  formData: FormData,
): Promise<StatusChangeState> {
  const admin = await requireRole("ADMIN");

  const parsed = schema.safeParse({
    teamId: formData.get("teamId"),
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "Datos inválidos." };

  const team = await db.team.findUnique({
    where: { id: parsed.data.teamId },
    include: { registration: true },
  });
  if (!team) return { error: "Equipo no encontrado." };

  const previous = {
    registrationStatus: team.registrationStatus,
    registrationTableStatus: team.registration?.status ?? null,
  };
  const next = parsed.data.status;
  if (previous.registrationStatus === next) return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.team.update({
      where: { id: team.id },
      data: {
        registrationStatus: next,
        paymentStatus: derivePaymentCache(next),
        registeredAt:
          (next === "CONFIRMED" || next === "PAYMENT_APPROVED") && !team.registeredAt
            ? new Date()
            : team.registeredAt,
      },
    });
    if (team.registration) {
      await tx.registration.update({
        where: { id: team.registration.id },
        data: {
          status: next,
          confirmedAt:
            next === "CONFIRMED" || next === "PAYMENT_APPROVED" ? new Date() : team.registration.confirmedAt,
        },
      });
    }
    await writeAudit(tx, {
      tournamentId: team.tournamentId,
      userId: admin.id,
      action: "registration.status.change",
      entity: "Registration",
      entityId: team.registration?.id ?? team.id,
      previousValue: previous,
      newValue: { status: next, reason: parsed.data.reason ?? null },
    });
  });

  revalidatePath(`/admin/equipos/${team.id}`);
  revalidatePath("/admin/equipos");
  revalidatePath("/admin");
  return { ok: true };
}
