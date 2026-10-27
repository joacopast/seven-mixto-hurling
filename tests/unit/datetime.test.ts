import { describe, it, expect } from "vitest";
import { formatFecha, formatHora, formatFechaHora } from "@/lib/datetime";

describe("formatFecha", () => {
  it("devuelve DD/MM/YYYY", () => {
    expect(formatFecha(new Date("2026-01-05T10:00:00"))).toBe("05/01/2026");
    expect(formatFecha(new Date("2026-10-24T00:00:00"))).toBe("24/10/2026");
  });
});

describe("formatHora", () => {
  it("devuelve HH:MM en formato 24hs, sin a. m./p. m.", () => {
    expect(formatHora(new Date("2026-10-24T23:59:00"))).toBe("23:59");
    expect(formatHora(new Date("2026-10-24T08:05:00"))).toBe("08:05");
    expect(formatHora(new Date("2026-10-24T00:00:00"))).toBe("00:00");
  });
});

describe("formatFechaHora", () => {
  it("combina fecha y hora", () => {
    expect(formatFechaHora(new Date("2026-10-24T23:59:00"))).toBe("24/10/2026 23:59");
  });
});
