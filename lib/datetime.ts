/**
 * Formateo de fecha/hora consistente en toda la app: fecha DD/MM/YYYY, hora
 * 24hs (ej. 23:59). `toLocaleString`/`toLocaleTimeString` con "es-AR" sin
 * opciones explícitas caen en 12hs — a veces sin siquiera mostrar a. m./p. m.,
 * quedando ambiguos — por eso todo pasa por acá en vez de llamarse suelto.
 */

export function formatFecha(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatHora(d: Date): string {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatFechaHora(d: Date): string {
  return `${formatFecha(d)} ${formatHora(d)}`;
}
