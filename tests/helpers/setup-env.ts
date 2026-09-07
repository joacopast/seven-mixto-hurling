/**
 * Setup de entorno para los tests.
 * Los tests unitarios (motor puro) no tocan nada de esto.
 * Los tests de integración usan la DATABASE_URL de TEST_DATABASE_URL si está
 * definida (una base separada), o la de .env.test.
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";

if (existsSync(".env.test")) {
  loadEnv({ path: ".env.test" });
} else {
  loadEnv();
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

process.env.ADMIN_EMAILS = process.env.ADMIN_EMAILS ?? "admin@test.local";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-not-for-prod";
