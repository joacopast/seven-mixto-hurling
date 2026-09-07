/**
 * Motor de precios — función pura, sin dependencias de framework ni DB.
 * Ver docs/arquitectura.html §3.
 *
 * Todos los montos se manejan en enteros (centavos de ARS). El frontend nunca
 * envía el precio: el backend lo calcula con esta función en cada cotización y
 * lo vuelve a verificar contra Registration.totalAmount al procesar el webhook.
 */

export type PriceTier = "EARLY" | "LATE";

export interface PricingConfig {
  /** Jugadores incluidos en el precio base. */
  basePlayers: number;
  /** Precio del equipo hasta priceChangeAt (centavos). */
  earlyPrice: number;
  /** Precio del equipo desde priceChangeAt (centavos). */
  latePrice: number;
  /** Precio por jugador adicional por encima de basePlayers (centavos). */
  extraPlayerPrice: number;
  /** Fecha/hora a partir de la cual rige latePrice. */
  priceChangeAt: Date;
  /** Recargo del medio de pago en basis points (600 = 6%). Se suma al total. */
  paymentSurchargeBp: number;
}

export interface PriceQuote {
  tier: PriceTier;
  playerCount: number;
  includedPlayers: number;
  extraPlayers: number;
  baseAmount: number;
  extraPlayersAmount: number;
  /** baseAmount + extraPlayersAmount, antes del recargo del medio de pago. */
  subtotal: number;
  surchargeAmount: number;
  /** Monto final a cobrar. */
  totalAmount: number;
}

const BP_DENOMINATOR = 10_000;

function assertConfig(config: PricingConfig): void {
  const positives: (keyof PricingConfig)[] = [
    "earlyPrice",
    "latePrice",
    "extraPlayerPrice",
  ];
  for (const key of positives) {
    const value = config[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(`PricingConfig.${String(key)} debe ser un entero >= 0`);
    }
    if (!Number.isInteger(value)) {
      throw new Error(`PricingConfig.${String(key)} debe ser un entero (centavos)`);
    }
  }
  if (!Number.isInteger(config.basePlayers) || config.basePlayers < 0) {
    throw new Error("PricingConfig.basePlayers debe ser un entero >= 0");
  }
  if (!Number.isInteger(config.paymentSurchargeBp) || config.paymentSurchargeBp < 0) {
    throw new Error("PricingConfig.paymentSurchargeBp debe ser un entero >= 0");
  }
  if (!(config.priceChangeAt instanceof Date) || Number.isNaN(config.priceChangeAt.getTime())) {
    throw new Error("PricingConfig.priceChangeAt debe ser una fecha válida");
  }
}

/**
 * Determina la tarifa vigente para una fecha dada.
 * El borde exacto (now === priceChangeAt) ya corresponde a la tarifa tardía.
 */
export function resolveTier(priceChangeAt: Date, now: Date): PriceTier {
  return now.getTime() < priceChangeAt.getTime() ? "EARLY" : "LATE";
}

/**
 * Calcula la cotización de inscripción de un equipo.
 *
 * @param config    configuración de precios del torneo
 * @param playerCount  cantidad de jugadores del plantel
 * @param now       momento de la cotización (default: ahora)
 */
export function calculatePrice(
  config: PricingConfig,
  playerCount: number,
  now: Date = new Date(),
): PriceQuote {
  assertConfig(config);

  if (!Number.isInteger(playerCount) || playerCount < 0) {
    throw new Error("playerCount debe ser un entero >= 0");
  }

  const tier = resolveTier(config.priceChangeAt, now);
  const baseAmount = tier === "EARLY" ? config.earlyPrice : config.latePrice;

  const includedPlayers = config.basePlayers;
  const extraPlayers = Math.max(0, playerCount - includedPlayers);
  const extraPlayersAmount = extraPlayers * config.extraPlayerPrice;

  const subtotal = baseAmount + extraPlayersAmount;

  // Recargo redondeado al centavo (round half up).
  const surchargeAmount = Math.round((subtotal * config.paymentSurchargeBp) / BP_DENOMINATOR);
  const totalAmount = subtotal + surchargeAmount;

  return {
    tier,
    playerCount,
    includedPlayers,
    extraPlayers,
    baseAmount,
    extraPlayersAmount,
    subtotal,
    surchargeAmount,
    totalAmount,
  };
}

/** Formatea centavos de ARS como "$275.000". */
export function formatArs(cents: number): string {
  const pesos = Math.round(cents / 100);
  return `$${pesos.toLocaleString("es-AR")}`;
}
