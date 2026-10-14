"use server";

import { z } from "zod";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresá un email válido."),
  callbackUrl: z.string().startsWith("/").optional(),
});

export interface LoginState {
  error?: string;
  sent?: boolean;
}

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    callbackUrl: formData.get("callbackUrl") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  try {
    await signIn("nodemailer", {
      email: parsed.data.email,
      redirectTo: parsed.data.callbackUrl ?? "/mi-equipo",
      redirect: false,
    });
    return { sent: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "No pudimos enviar el enlace. Probá de nuevo en un momento." };
    }
    throw err;
  }
}
