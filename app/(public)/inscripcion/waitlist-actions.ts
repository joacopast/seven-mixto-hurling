"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { joinWaitlist, WaitlistError } from "@/lib/services/waitlist";
import { getCapacity } from "@/lib/tournament/queries";
import { isCountryName } from "@/lib/countries";

const schema = z.object({
  teamName: z.string().trim().min(1, "Obligatorio.").max(80).refine(isCountryName, "Elegí un país de la lista."),
  contactName: z.string().trim().min(1, "Obligatorio.").max(80),
  contactEmail: z.string().trim().toLowerCase().email("Email inválido."),
  contactPhone: z.string().trim().min(1, "Obligatorio.").max(30),
});

export interface WaitlistState {
  position?: number;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function joinWaitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const limited = await rateLimit(`waitlist:${ip ?? "unknown"}`, { max: 5, windowSec: 600 });
  if (!limited.success) return { error: "Demasiados intentos. Probá más tarde." };

  const parsed = schema.safeParse({
    teamName: formData.get("teamName"),
    contactName: formData.get("contactName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[i.path.join(".")] = i.message;
    return { fieldErrors };
  }

  const capacity = await getCapacity();
  if (!capacity.isFull) {
    return { error: "Se liberaron cupos: volvé a la inscripción normal." };
  }

  try {
    const { position } = await joinWaitlist(parsed.data, { ip });
    return { position };
  } catch (err) {
    if (err instanceof WaitlistError) return { error: err.message };
    console.error("joinWaitlistAction", err);
    return { error: "No pudimos registrarte. Probá de nuevo." };
  }
}
