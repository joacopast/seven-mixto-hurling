import { describe, it, expect, beforeEach, afterAll, afterEach, vi } from "vitest";
import { testDb, resetDb } from "../helpers/db";
import { verifyStaffCredentials, createStaffSession, staffAuthConfigured } from "@/lib/auth/staff";

beforeEach(async () => {
  await resetDb();
  vi.unstubAllEnvs();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("STAFF_USERNAME", "");
  vi.stubEnv("STAFF_PASSWORD", "");
  vi.stubEnv("STAFF_PASSWORD_HASH", "");
  vi.stubEnv("STAFF_ADMIN_EMAIL", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await testDb.$disconnect();
});

describe("verifyStaffCredentials — fuera de producción (dev/test)", () => {
  it("acepta admin/admin cuando no hay nada configurado", async () => {
    expect(await verifyStaffCredentials("admin", "admin")).toBe(true);
    expect(await verifyStaffCredentials("admin", "wrong")).toBe(false);
    expect(await verifyStaffCredentials("otro", "admin")).toBe(false);
  });

  it("usuario y contraseña en texto plano configurados tienen prioridad", async () => {
    vi.stubEnv("STAFF_USERNAME", "organizacion");
    vi.stubEnv("STAFF_PASSWORD", "clave-secreta");
    expect(await verifyStaffCredentials("organizacion", "clave-secreta")).toBe(true);
    expect(await verifyStaffCredentials("admin", "admin")).toBe(false);
  });

  it("acepta un hash bcrypt válido", async () => {
    const bcrypt = await import("bcryptjs");
    vi.stubEnv("STAFF_USERNAME", "staff");
    vi.stubEnv("STAFF_PASSWORD_HASH", await bcrypt.hash("hunter2", 4));
    expect(await verifyStaffCredentials("staff", "hunter2")).toBe(true);
    expect(await verifyStaffCredentials("staff", "hunter3")).toBe(false);
  });

  it("usuario es case-insensitive, la contraseña no", async () => {
    vi.stubEnv("STAFF_USERNAME", "Admin");
    vi.stubEnv("STAFF_PASSWORD", "Secreta");
    expect(await verifyStaffCredentials("admin", "Secreta")).toBe(true);
    expect(await verifyStaffCredentials("ADMIN", "Secreta")).toBe(true);
    expect(await verifyStaffCredentials("admin", "secreta")).toBe(false);
  });
});

describe("verifyStaffCredentials — producción", () => {
  it("sin nada configurado, el login queda cerrado (no admin/admin)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(await verifyStaffCredentials("admin", "admin")).toBe(false);
    expect(staffAuthConfigured()).toBe(false);
  });

  it("con STAFF_PASSWORD_HASH configurado, funciona igual que en dev", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const bcrypt = await import("bcryptjs");
    vi.stubEnv("STAFF_USERNAME", "org");
    vi.stubEnv("STAFF_PASSWORD_HASH", await bcrypt.hash("prod-pass", 4));
    expect(await verifyStaffCredentials("org", "prod-pass")).toBe(true);
    expect(staffAuthConfigured()).toBe(true);
  });
});

describe("createStaffSession", () => {
  it("crea (o reusa) un usuario ADMIN y una sesión de base de datos válida", async () => {
    vi.stubEnv("ADMIN_EMAILS", "org@test.local");

    const session = await createStaffSession();
    const user = await testDb.user.findUniqueOrThrow({ where: { id: session.userId } });
    expect(user.email).toBe("org@test.local");
    expect(user.role).toBe("ADMIN");

    const dbSession = await testDb.session.findUniqueOrThrow({ where: { sessionToken: session.token } });
    expect(dbSession.userId).toBe(user.id);
    expect(dbSession.expires.getTime()).toBeGreaterThan(Date.now());
  });

  it("reutiliza el mismo usuario en logins sucesivos y crea sesiones distintas", async () => {
    vi.stubEnv("ADMIN_EMAILS", "org2@test.local");
    const a = await createStaffSession();
    const b = await createStaffSession();
    expect(a.userId).toBe(b.userId);
    expect(a.token).not.toBe(b.token);
    expect(await testDb.session.count({ where: { userId: a.userId } })).toBe(2);
  });
});
