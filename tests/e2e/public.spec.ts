import { test, expect } from "@playwright/test";

test.describe("sitio público", () => {
  test("home muestra la propuesta y los CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Seven Mixto" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Inscribí a tu equipo" }).first()).toBeVisible();
    await expect(page.getByText("Cómo se juega")).toBeVisible();
    await expect(page.getByText(/hasta 15\/11/i).first()).toBeVisible();
  });

  test("reglamento muestra reglas de juego", async ({ page }) => {
    await page.goto("/reglamento");
    await expect(page.getByRole("heading", { name: "Reglamento" })).toBeVisible();
    await expect(page.getByText(/7 personas en cancha/i)).toBeVisible();
    await expect(page.getByText(/prohibido jugar de flick/i)).toBeVisible();
  });

  test("torneo carga con el estado del torneo", async ({ page }) => {
    await page.goto("/torneo");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(/equipos confirmados/i).first()).toBeVisible();
  });

  test("áreas privadas redirigen al login correspondiente", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/staff/);
    await page.goto("/mi-equipo");
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test.describe("wizard de inscripción", () => {
  test("avanza por los primeros pasos con validación", async ({ page }) => {
    await page.goto("/inscripcion");

    // Paso 1 — equipo
    await expect(page.getByRole("heading", { name: "Datos del equipo" })).toBeVisible();
    const continuar = page.getByRole("button", { name: "Continuar" });
    await expect(continuar).toBeDisabled();
    await page.getByLabel("Nombre del equipo").fill("Los Testers");
    await expect(continuar).toBeEnabled();
    await continuar.click();

    // Paso 2 — responsable
    await expect(page.getByRole("heading", { name: /Responsable/ })).toBeVisible();
    await page.getByLabel("Nombre y apellido").fill("Ana Tester");
    await page.getByLabel("Email").fill("ana.tester.e2e@example.com");
    await page.getByLabel("Teléfono").fill("1155667788");
    await page.getByRole("button", { name: "Continuar" }).click();

    // Paso 3 — jugadores
    await expect(page.getByRole("heading", { name: "Jugadores" })).toBeVisible();
    await expect(page.getByText(/entre 7 y 20 jugadores/i)).toBeVisible();
  });
});
