// Rango Unicode de marcas diacríticas combinantes (acentos, tildes, diéresis).
const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "equipo";
}
