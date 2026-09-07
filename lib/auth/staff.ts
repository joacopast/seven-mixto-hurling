import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

/**
 * Acceso de staff al panel /admin: usuario y contraseña fijos (no magic link),
 * pensado para el equipo organizador cuando el email no está configurado o
 * hace falta un ingreso rápido y compartido.
 *
 * Producción: hace falta STAFF_USERNAME + (STAFF_PASSWORD_HASH recomendado,
 * generado con `npm run hash:password -- "contraseña"`) o STAFF_PASSWORD en
 * texto plano. Sin nada configurado, el login queda cerrado (nunca "admin/admin"
 * por accidente en prod).
 *
 * Desarrollo: sin configurar, cae a usuario "admin" / contraseña "admin".
 */

const DEV_DEFAULT_USERNAME = "admin";
const DEV_DEFAULT_PASSWORD = "admin";

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/** true si hay credenciales utilizables (configuradas, o estamos en dev). */
export function staffAuthConfigured(): boolean {
  return Boolean(process.env.STAFF_PASSWORD_HASH || process.env.STAFF_PASSWORD) || !isProd();
}

/** Compara dos strings en tiempo constante (evita timing attacks). */
function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Igual comparamos algo del mismo tamaño para no filtrar el largo por timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function verifyStaffCredentials(username: string, password: string): Promise<boolean> {
  const prod = isProd();
  const expectedUsername = process.env.STAFF_USERNAME?.trim() || (prod ? null : DEV_DEFAULT_USERNAME);
  if (!expectedUsername) return false;

  const usernameOk = timingSafeEqualStr(username.trim().toLowerCase(), expectedUsername.toLowerCase());

  const hash = process.env.STAFF_PASSWORD_HASH?.trim();
  const plain = process.env.STAFF_PASSWORD;

  let passwordOk: boolean;
  if (hash) {
    passwordOk = await bcrypt.compare(password, hash);
  } else if (plain) {
    passwordOk = timingSafeEqualStr(password, plain);
  } else if (!prod) {
    passwordOk = timingSafeEqualStr(password, DEV_DEFAULT_PASSWORD);
  } else {
    passwordOk = false;
  }

  return usernameOk && passwordOk;
}

export interface StaffSession {
  cookieName: string;
  token: string;
  expires: Date;
  secure: boolean;
  userId: string;
}

/**
 * Crea una sesión de base de datos (la misma que usa Auth.js) para el usuario
 * ADMIN de staff, y devuelve lo necesario para setear la cookie de sesión.
 */
export async function createStaffSession(): Promise<StaffSession> {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = process.env.STAFF_ADMIN_EMAIL?.trim().toLowerCase() || adminEmails[0] || "staff@sevenmixto.local";

  const user = await db.user.upsert({
    where: { email },
    update: { role: "ADMIN" },
    create: { email, name: "Staff", role: "ADMIN" },
  });

  const hours = Number(process.env.STAFF_SESSION_HOURS) || 24 * 7;
  const expires = new Date(Date.now() + hours * 3_600_000);
  const token = crypto.randomBytes(32).toString("hex");

  await db.session.create({ data: { sessionToken: token, userId: user.id, expires } });

  const secure = isProd();
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";

  return { cookieName, token, expires, secure, userId: user.id };
}
