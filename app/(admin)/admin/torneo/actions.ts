"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import { getActiveTournament } from "@/lib/tournament/queries";
import {
  getConfirmedTeams,
  buildAutoAssignment,
  saveGroupAssignment,
  generateGroupPhaseFixture,
  setTournamentStatus,
  notifyFixturePublished,
  GroupsError,
} from "@/lib/services/groups";
import { generateCups, CupsError } from "@/lib/services/cups";

export interface ActionState {
  ok?: boolean;
  message?: string;
  error?: string;
}

async function ctx() {
  const admin = await requireRole("ADMIN");
  const hdrs = await headers();
  return {
    userId: admin.id,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  };
}

function revalidate() {
  revalidatePath("/admin/torneo");
  revalidatePath("/admin/torneo/grupos");
  revalidatePath("/admin/torneo/resultados");
  revalidatePath("/admin/torneo/copas");
  revalidatePath("/admin");
  revalidatePath("/torneo");
}

export async function openRegistration(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  if (t.status !== "SETUP") {
    return { error: "La inscripción ya se abrió (o el torneo ya avanzó más allá de eso)." };
  }
  await setTournamentStatus(t.id, "REGISTRATION_OPEN", c);
  revalidate();
  return { ok: true, message: "Inscripción abierta." };
}

export async function closeRegistration(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  if (t.status !== "REGISTRATION_OPEN") {
    return { error: "La inscripción no está abierta." };
  }
  await setTournamentStatus(t.id, "REGISTRATION_CLOSED", c);
  revalidate();
  return { ok: true, message: "Inscripción cerrada." };
}

export async function reopenRegistration(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  if (t.status !== "REGISTRATION_CLOSED") {
    return { error: "Solo se puede reabrir si está cerrada." };
  }
  await setTournamentStatus(t.id, "REGISTRATION_OPEN", c);
  revalidate();
  return { ok: true, message: "Inscripción reabierta." };
}

export async function autoDrawGroups(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  const confirmed = await getConfirmedTeams(t.id);
  if (confirmed.length < t.config!.groupCount * 2) {
    return { error: `Hacen falta al menos ${t.config!.groupCount * 2} equipos confirmados.` };
  }
  try {
    const assignment = buildAutoAssignment(
      confirmed.map((x) => ({ id: x.id, seed: x.seed, playerCount: x.playerCount })),
      t.config!.groupCount,
      `${t.id}:draw:${Date.now()}`,
    );
    await saveGroupAssignment(t.id, assignment, c);
    revalidate();
    return { ok: true, message: `Grupos sorteados (${confirmed.length} equipos).` };
  } catch (err) {
    if (err instanceof GroupsError) return { error: err.message };
    throw err;
  }
}

export async function generateFixture(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  try {
    const res = await generateGroupPhaseFixture(t.id, c);
    revalidate();
    return { ok: true, message: `Fixture generado: ${res.matches} partidos en ${res.tandas} tandas.` };
  } catch (err) {
    if (err instanceof GroupsError) return { error: err.message };
    throw err;
  }
}

export async function publishGroups(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  if (t.status !== "REGISTRATION_CLOSED") {
    return { error: "Cerrá la inscripción y generá el fixture antes de publicar." };
  }
  await setTournamentStatus(t.id, "GROUPS_PUBLISHED", c);
  const notified = await notifyFixturePublished(t.id);
  revalidate();
  return {
    ok: true,
    message: `Grupos y fixture publicados. Aviso encolado para ${notified} equipos.`,
  };
}

export async function startGroupPhase(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  if (t.status !== "GROUPS_PUBLISHED") {
    return { error: "Primero publicá los grupos." };
  }
  await setTournamentStatus(t.id, "GROUPS_IN_PROGRESS", c);
  revalidate();
  return { ok: true, message: "Fase de grupos en juego." };
}

export async function generateCupsAction(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  try {
    const res = await generateCups(t.id, c);
    revalidate();
    return {
      ok: true,
      message: `Copas generadas: ${res.cups.map((x) => x.name).join(", ")} · ${res.matches} partidos.`,
    };
  } catch (err) {
    if (err instanceof CupsError) return { error: err.message };
    throw err;
  }
}

export async function reopenFromFinished(): Promise<ActionState> {
  const c = await ctx();
  const t = await getActiveTournament();
  if (t.status !== "FINISHED") {
    return { error: "El torneo no está finalizado." };
  }
  await setTournamentStatus(t.id, "CUPS_IN_PROGRESS", c);
  revalidate();
  return { ok: true, message: "Torneo reabierto — se puede corregir un resultado de copas." };
}
