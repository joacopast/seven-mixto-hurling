/**
 * Constantes de la app. El slug del torneo activo se resuelve por env para
 * poder correr varias ediciones sobre la misma base si hiciera falta.
 */
export const ACTIVE_TOURNAMENT_SLUG =
  process.env.ACTIVE_TOURNAMENT_SLUG ?? "seven-mixto-hurling-2026";

export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export const SITE = {
  name: "Seven Mixto",
  tagline: "Torneo de hockey mixto · 64 equipos · un día",
  description:
    "Seven Mixto: el torneo social de hockey mixto del club. 64 equipos, fase de grupos y cuatro copas — Oro, Plata, Bronce y Madera. Inscribí a tu equipo online.",
} as const;
