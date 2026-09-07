import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra el servidor de producción local (`npm run start`) apuntando a la
 * base de datos de desarrollo, que ya tiene el torneo semilla en
 * REGISTRATION_OPEN. Requiere `npm run build` y `npm run db:seed` previos.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
