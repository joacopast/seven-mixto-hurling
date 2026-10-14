"use server";

import { headers } from "next/headers";
import { signIn } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { registrationSubmitSchema } from "@/lib/validation/registration";
import { createRegistration, RegistrationError } from "@/lib/services/registration";

export interface SubmitResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  blockingIssues?: string[];
  data?: {
    teamId: string;
    registrationId: string;
    managerEmail: string;
    totalAmount: number;
  };
}

export async function submitRegistration(raw: unknown): Promise<SubmitResult> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const limited = await rateLimit(`registration:${ip ?? "unknown"}`, { max: 5, windowSec: 600 });
  if (!limited.success) {
    return { ok: false, error: "Demasiados intentos. Esperá unos minutos y probá de nuevo." };
  }

  const parsed = registrationSubmitSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join(".")] = issue.message;
    }
    return { ok: false, error: "Revisá los datos del formulario.", fieldErrors };
  }

  try {
    const result = await createRegistration(parsed.data, { ip });

    // Enviar magic link para que el responsable pueda administrar su equipo.
    try {
      await signIn("nodemailer", {
        email: result.managerEmail,
        redirectTo: "/mi-equipo",
        redirect: false,
      });
    } catch {
      // No bloquear la inscripción si falla el envío del email.
    }

    return {
      ok: true,
      data: {
        teamId: result.teamId,
        registrationId: result.registrationId,
        managerEmail: result.managerEmail,
        totalAmount: result.quote.totalAmount,
      },
    };
  } catch (err) {
    if (err instanceof RegistrationError) {
      const blockingIssues =
        err.code === "ROSTER_INVALID" && Array.isArray(err.details)
          ? (err.details as { message: string }[]).map((i) => i.message)
          : undefined;
      return { ok: false, error: err.message, blockingIssues };
    }
    console.error("submitRegistration", err);
    return { ok: false, error: "Ocurrió un error inesperado. Probá de nuevo." };
  }
}
