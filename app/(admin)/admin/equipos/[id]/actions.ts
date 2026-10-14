"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { RegistrationStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { writeAudit } from "@/lib/services/audit";
import {
  adminUpdateTeam,
  adminAddPlayer,
  adminRemovePlayer,
  adminDeleteTeam,
  AdminTeamError,
} from "@/lib/services/admin-teams";
import { confirmManualPayment, PaymentError } from "@/lib/services/payment";
import { formatArs } from "@/lib/tournament/pricing";
import { isCountryName } from "@/lib/countries";

async function adminCtx() {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  return { userId: admin.id, ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null };
}

function revalidateTeam(teamId: string) {
  revalidatePath(`/admin/equipos/${teamId}`);
  revalidatePath("/admin/equipos");
  revalidatePath("/admin");
  revalidatePath("/admin/pagos");
  revalidatePath("/mi-equipo");
}

/* ---------------- Confirmar pago (transferencia manual) ---------------- */

export interface ConfirmPaymentState {
  ok?: boolean;
  message?: string;
  error?: string;
}

export async function confirmPayment(
  registrationId: string,
  teamId: string,
  note: string,
  amountPesos?: number,
): Promise<ConfirmPaymentState> {
  const ctx = await adminCtx();
  try {
    const amount = amountPesos ? Math.round(amountPesos * 100) : undefined;
    const res = await confirmManualPayment(registrationId, { note: note || null, amount }, ctx);
    revalidateTeam(teamId);
    if (res.outcome === "WAITLISTED_OVERBOOK") {
      return {
        ok: true,
        message: "Ya no había cupo: el equipo quedó en lista de espera. Hay que reintegrarle la transferencia.",
      };
    }
    if (res.outcome === "NOOP") {
      return { ok: true, message: "Ya estaba confirmado." };
    }
    if (res.outcome === "DEPOSIT_RECORDED") {
      return {
        ok: true,
        message: `Seña registrada. Todavía falta ${formatArs(res.amountOwed ?? 0)}.`,
      };
    }
    return { ok: true, message: "Pago confirmado. El equipo quedó inscripto." };
  } catch (err) {
    if (err instanceof PaymentError) return { error: err.message };
    throw err;
  }
}

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
    case "DEPOSIT_PAID":
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

/* ---------------- Editar equipo ---------------- */

const teamSchema = z.object({
  teamId: z.string().min(1),
  name: z.string().trim().min(1).max(80).refine(isCountryName, "Elegí un país de la lista."),
  contactName: z.string().trim().min(1).max(80),
  contactEmail: z.string().trim().toLowerCase().email(),
  contactPhone: z.string().trim().min(1).max(30),
  seed: z.union([z.coerce.number().int().min(1).max(512), z.literal("")]).optional(),
  adminNotes: z.string().trim().max(500).optional(),
});

export interface TeamEditState {
  ok?: boolean;
  error?: string;
}

export async function updateTeam(_prev: TeamEditState, formData: FormData): Promise<TeamEditState> {
  const ctx = await adminCtx();
  const parsed = teamSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revisá los datos." };
  const d = parsed.data;
  try {
    await adminUpdateTeam(
      d.teamId,
      {
        name: d.name,
        contactName: d.contactName,
        contactEmail: d.contactEmail,
        contactPhone: d.contactPhone,
        seed: d.seed === "" || d.seed === undefined ? null : d.seed,
        adminNotes: d.adminNotes ?? "",
      },
      ctx,
    );
    revalidateTeam(d.teamId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminTeamError) return { error: err.message };
    throw err;
  }
}

/* ---------------- Jugadores ---------------- */

const playerSchema = z.object({
  teamId: z.string().min(1),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  docType: z.enum(["DNI", "PASSPORT"]).default("DNI"),
  docNumber: z.string().trim().min(1).max(20),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["M", "F", "X"]),
  isPlayer: z.boolean().default(true),
  shirtNumber: z.union([z.coerce.number().int().min(0).max(999), z.literal("")]).optional(),
  dietaryRestriction: z.string().trim().max(200).optional(),
  attendsParty: z.boolean().default(true),
});

export interface PlayerActionState {
  ok?: boolean;
  error?: string;
}

export async function addPlayer(_prev: PlayerActionState, formData: FormData): Promise<PlayerActionState> {
  const ctx = await adminCtx();
  const parsed = playerSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    isPlayer: formData.get("isPlayer") === "on",
    attendsParty: formData.get("attendsParty") === "on",
  });
  if (!parsed.success) return { error: "Revisá los datos del jugador." };
  const d = parsed.data;
  try {
    await adminAddPlayer(
      d.teamId,
      {
        firstName: d.firstName,
        lastName: d.lastName,
        docType: d.docType,
        docNumber: d.docNumber,
        birthDate: d.birthDate,
        gender: d.gender,
        isPlayer: d.isPlayer,
        shirtNumber: d.shirtNumber === "" || d.shirtNumber === undefined ? null : d.shirtNumber,
        dietaryRestriction: d.dietaryRestriction || undefined,
        attendsParty: d.attendsParty,
      },
      ctx,
    );
    revalidateTeam(d.teamId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminTeamError) return { error: err.message };
    throw err;
  }
}

export async function removePlayer(playerId: string, teamId: string): Promise<PlayerActionState> {
  const ctx = await adminCtx();
  try {
    await adminRemovePlayer(playerId, ctx);
    revalidateTeam(teamId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminTeamError) return { error: err.message };
    throw err;
  }
}

/* ---------------- Eliminar equipo ---------------- */

export async function deleteTeam(teamId: string): Promise<{ error?: string }> {
  const ctx = await adminCtx();
  try {
    await adminDeleteTeam(teamId, ctx);
  } catch (err) {
    if (err instanceof AdminTeamError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/equipos");
  revalidatePath("/admin");
  redirect("/admin/equipos");
}
