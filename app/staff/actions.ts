"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { verifyStaffCredentials, createStaffSession } from "@/lib/auth/staff";
import { writeAudit } from "@/lib/services/audit";
import { db } from "@/lib/db";

const schema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
  callbackUrl: z.string().optional(),
});

export interface StaffLoginState {
  error?: string;
}

export async function staffLogin(_prev: StaffLoginState, formData: FormData): Promise<StaffLoginState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Rate limit generoso pero real: las credenciales son fijas y compartidas,
  // así que hay que frenar fuerza bruta.
  const limited = await rateLimit(`staff-login:${ip}`, { max: 8, windowSec: 600 });
  if (!limited.success) {
    return { error: "Demasiados intentos. Esperá unos minutos y probá de nuevo." };
  }

  const parsed = schema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    callbackUrl: formData.get("callbackUrl") || undefined,
  });
  if (!parsed.success) return { error: "Completá usuario y contraseña." };

  const ok = await verifyStaffCredentials(parsed.data.username, parsed.data.password);
  if (!ok) return { error: "Usuario o contraseña incorrectos." };

  const session = await createStaffSession();

  const store = await cookies();
  store.set(session.cookieName, session.token, {
    httpOnly: true,
    secure: session.secure,
    sameSite: "lax",
    path: "/",
    expires: session.expires,
  });

  await writeAudit(db, {
    userId: session.userId,
    action: "staff.login",
    entity: "User",
    entityId: session.userId,
    ip,
  });

  const target =
    parsed.data.callbackUrl && parsed.data.callbackUrl.startsWith("/admin")
      ? parsed.data.callbackUrl
      : "/admin";
  redirect(target);
}
