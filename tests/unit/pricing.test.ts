import { describe, it, expect } from "vitest";
import {
  calculatePrice,
  resolveTier,
  formatArs,
  type PricingConfig,
} from "@/lib/tournament/pricing";

// Config del pliego, en centavos de ARS.
const baseConfig: PricingConfig = {
  basePlayers: 10,
  earlyPrice: 275_000_00,
  latePrice: 300_000_00,
  extraPlayerPrice: 27_500_00,
  priceChangeAt: new Date("2026-11-15T00:00:00-03:00"),
  paymentSurchargeBp: 0,
};

const early = new Date("2026-11-01T12:00:00-03:00");
const late = new Date("2026-12-01T12:00:00-03:00");

describe("resolveTier", () => {
  it("antes de la fecha de cambio → EARLY", () => {
    expect(resolveTier(baseConfig.priceChangeAt, early)).toBe("EARLY");
  });

  it("después de la fecha de cambio → LATE", () => {
    expect(resolveTier(baseConfig.priceChangeAt, late)).toBe("LATE");
  });

  it("exactamente en la fecha de cambio → LATE (el borde ya es tarifa tardía)", () => {
    expect(resolveTier(baseConfig.priceChangeAt, baseConfig.priceChangeAt)).toBe("LATE");
  });

  it("un milisegundo antes → EARLY", () => {
    const oneMsBefore = new Date(baseConfig.priceChangeAt.getTime() - 1);
    expect(resolveTier(baseConfig.priceChangeAt, oneMsBefore)).toBe("EARLY");
  });
});

describe("calculatePrice — tarifa temprana", () => {
  it("10 jugadores exactos = solo el equipo base", () => {
    const q = calculatePrice(baseConfig, 10, early);
    expect(q.tier).toBe("EARLY");
    expect(q.extraPlayers).toBe(0);
    expect(q.extraPlayersAmount).toBe(0);
    expect(q.subtotal).toBe(275_000_00);
    expect(q.totalAmount).toBe(275_000_00);
  });

  it("menos de 10 jugadores no genera crédito (no baja del base)", () => {
    const q = calculatePrice(baseConfig, 7, early);
    expect(q.extraPlayers).toBe(0);
    expect(q.totalAmount).toBe(275_000_00);
  });

  it("12 jugadores = base + 2 adicionales", () => {
    const q = calculatePrice(baseConfig, 12, early);
    expect(q.extraPlayers).toBe(2);
    expect(q.extraPlayersAmount).toBe(55_000_00);
    expect(q.subtotal).toBe(330_000_00);
    expect(q.totalAmount).toBe(330_000_00);
  });

  it("11 jugadores = base + 1 adicional (ejemplo del wizard §29)", () => {
    const q = calculatePrice(baseConfig, 11, early);
    expect(q.extraPlayers).toBe(1);
    expect(q.totalAmount).toBe(302_500_00);
  });
});

describe("calculatePrice — tarifa tardía", () => {
  it("10 jugadores después del 15/11 = base tardío", () => {
    const q = calculatePrice(baseConfig, 10, late);
    expect(q.tier).toBe("LATE");
    expect(q.baseAmount).toBe(300_000_00);
    expect(q.totalAmount).toBe(300_000_00);
  });

  it("14 jugadores tardío = 300.000 + 4×27.500", () => {
    const q = calculatePrice(baseConfig, 14, late);
    expect(q.extraPlayers).toBe(4);
    expect(q.extraPlayersAmount).toBe(110_000_00);
    expect(q.totalAmount).toBe(410_000_00);
  });
});

describe("calculatePrice — recargo de medio de pago", () => {
  const withSurcharge: PricingConfig = { ...baseConfig, paymentSurchargeBp: 600 };

  it("aplica 6% sobre el subtotal", () => {
    const q = calculatePrice(withSurcharge, 12, early);
    expect(q.subtotal).toBe(330_000_00);
    expect(q.surchargeAmount).toBe(19_800_00);
    expect(q.totalAmount).toBe(349_800_00);
  });

  it("redondea el recargo al centavo", () => {
    const odd: PricingConfig = {
      ...baseConfig,
      earlyPrice: 100_001, // 1000,01
      paymentSurchargeBp: 333, // 3,33%
    };
    const q = calculatePrice(odd, 10, early);
    // 100001 * 0.0333 = 3330.033 -> 3330
    expect(q.surchargeAmount).toBe(3330);
    expect(q.totalAmount).toBe(103_331);
  });
});

describe("calculatePrice — validaciones", () => {
  it("rechaza playerCount negativo", () => {
    expect(() => calculatePrice(baseConfig, -1, early)).toThrow();
  });

  it("rechaza playerCount no entero", () => {
    expect(() => calculatePrice(baseConfig, 10.5, early)).toThrow();
  });

  it("rechaza precios negativos en la config", () => {
    expect(() => calculatePrice({ ...baseConfig, earlyPrice: -1 }, 10, early)).toThrow();
  });

  it("rechaza precios no enteros (centavos)", () => {
    expect(() => calculatePrice({ ...baseConfig, extraPlayerPrice: 27_500.5 }, 10, early)).toThrow();
  });

  it("rechaza priceChangeAt inválido", () => {
    expect(() =>
      calculatePrice({ ...baseConfig, priceChangeAt: new Date("no") }, 10, early),
    ).toThrow();
  });
});

describe("formatArs", () => {
  it("formatea centavos como pesos con separador de miles", () => {
    expect(formatArs(275_000_00)).toBe("$275.000");
    expect(formatArs(349_800_00)).toBe("$349.800");
    expect(formatArs(0)).toBe("$0");
  });
});
