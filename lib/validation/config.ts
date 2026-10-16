import { z } from "zod";

/** Pesos (lo que ve el admin) → centavos (lo que guarda la DB). */
const pesosToCents = z
  .union([z.coerce.number().min(0), z.literal("")])
  .transform((v) => (v === "" ? 0 : Math.round(Number(v) * 100)));

const optionalDate = z
  .union([z.string().datetime({ offset: true }), z.string().length(0), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)])
  .optional()
  .transform((v) => (v && v.length > 0 ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Fecha inválida.");

const requiredDate = z
  .string()
  .min(1, "Obligatoria.")
  .transform((v) => new Date(v))
  .refine((d) => !Number.isNaN(d.getTime()), "Fecha inválida.");

const TIEBREAK = z.enum([
  "POINTS",
  "HEAD_TO_HEAD",
  "GOAL_DIFF",
  "GOALS_FOR",
  "FAIR_PLAY",
  "DRAW_LOTS",
]);

export const configFormSchema = z.object({
  // Torneo
  name: z.string().trim().min(1).max(120),
  edition: z.string().trim().min(1).max(60),
  venueName: z.string().trim().max(120).optional(),
  startDate: optionalDate,
  endDate: optionalDate,

  // Estructura
  maxTeams: z.coerce.number().int().min(2).max(512),
  groupCount: z.coerce.number().int().min(1).max(64),
  groupSize: z.coerce.number().int().min(2).max(16),
  cupNames: z.string().trim().min(1), // "ORO, PLATA, BRONCE, MADERA"
  cupAssignmentStrategy: z.enum(["GROUP_POSITION", "GLOBAL_RANKING"]),
  thirdPlaceMatch: z.coerce.boolean(),

  // Partidos y canchas
  matchDurationMin: z.coerce.number().int().min(1).max(120),
  fieldCount: z.coerce.number().int().min(1).max(40),
  turnoverMin: z.coerce.number().int().min(0).max(60),
  drawResolution: z.enum(["SHOOTOUT", "EXTRA_TIME", "NONE"]),
  /** Cada cuántos partidos por cancha se pausa para regar. 0 = sin pausas. */
  waterBreakEveryMatches: z.coerce.number().int().min(0).max(50),
  waterBreakMinutes: z.coerce.number().int().min(0).max(60),

  // Puntos y desempates
  pointsWin: z.coerce.number().int().min(0).max(10),
  pointsDraw: z.coerce.number().int().min(0).max(10),
  pointsLoss: z.coerce.number().int().min(0).max(10),
  pointsWalkover: z.coerce.number().int().min(0).max(10),
  walkoverScore: z.string().regex(/^\d+\s*-\s*\d+$/, "Formato «3-0»."),
  tiebreakers: z.array(TIEBREAK).min(1),

  // Plantel
  minPlayers: z.coerce.number().int().min(1).max(50),
  maxPlayers: z.coerce.number().int().min(1).max(50),
  playersOnField: z.coerce.number().int().min(1).max(15),
  maxMenOnField: z.coerce.number().int().min(0).max(15),
  minPlayerAge: z.coerce.number().int().min(0).max(99),

  // Precios (el form los recibe en pesos)
  basePlayers: z.coerce.number().int().min(0).max(50),
  earlyPrice: pesosToCents,
  latePrice: pesosToCents,
  extraPlayerPrice: pesosToCents,
  priceChangeAt: requiredDate,
  paymentSurchargePct: z.coerce.number().min(0).max(50), // % -> se guarda como basis points

  // Medio de pago
  paymentMethod: z.enum(["MANUAL_TRANSFER", "MERCADOPAGO"]).default("MANUAL_TRANSFER"),
  bankHolderName: z.string().trim().max(120).optional(),
  bankCuit: z.string().trim().max(30).optional(),
  bankName: z.string().trim().max(80).optional(),
  bankAlias: z.string().trim().max(60).optional(),
  bankCbu: z.string().trim().max(30).optional(),
  whatsappPhone: z.string().trim().max(30).optional(),
  whatsappMessageTemplate: z.string().trim().max(500).optional(),

  // Fechas
  registrationOpensAt: optionalDate,
  registrationClosesAt: optionalDate,
  rosterLockAt: optionalDate,
  teamEditLockAt: optionalDate,
  waitlistPaymentWindowHours: z.coerce.number().int().min(1).max(720),

  // Contenido
  rulesMarkdown: z.string().max(20000).optional(),
  inclusionsList: z.string().optional(), // una por línea
  faqJson: z.string().optional(), // JSON [{q,a}]
  instagramUrl: z.string().trim().max(200).optional(),
});

export type ConfigFormInput = z.infer<typeof configFormSchema>;
