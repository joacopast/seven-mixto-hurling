import { describe, it, expect } from "vitest";
import { normalizePhone, renderWhatsAppMessage, buildWhatsAppLink } from "@/lib/tournament/whatsapp";

describe("normalizePhone", () => {
  it("deja solo dígitos", () => {
    expect(normalizePhone("+54 9 11 2233-4455")).toBe("5491122334455");
    expect(normalizePhone("(011) 2233.4455")).toBe("01122334455");
  });
});

describe("renderWhatsAppMessage", () => {
  it("reemplaza {team} y {amount}", () => {
    const out = renderWhatsAppMessage("Hola, soy {team}, pagué ${amount}.", {
      team: "Los Zorros",
      amount: "330.000",
    });
    expect(out).toBe("Hola, soy Los Zorros, pagué $330.000.");
  });

  it("reemplaza todas las ocurrencias", () => {
    const out = renderWhatsAppMessage("{team} - {team}", { team: "A", amount: "1" });
    expect(out).toBe("A - A");
  });
});

describe("buildWhatsAppLink", () => {
  const vars = { team: "Los Zorros", amount: "330.000" };

  it("arma el link wa.me con el texto codificado", () => {
    const link = buildWhatsAppLink("+54 9 11 2233-4455", "Equipo {team}, total ${amount}", vars);
    expect(link).toBe(
      "https://wa.me/5491122334455?text=" +
        encodeURIComponent("Equipo Los Zorros, total $330.000"),
    );
  });

  it("devuelve null si no hay número configurado", () => {
    expect(buildWhatsAppLink(null, "hola", vars)).toBeNull();
    expect(buildWhatsAppLink("", "hola", vars)).toBeNull();
    expect(buildWhatsAppLink(undefined, "hola", vars)).toBeNull();
  });
});
