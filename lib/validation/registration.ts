import { z } from "zod";

/** Normaliza un documento: saca puntos, espacios y guiones. */
export const normalizeDoc = (doc: string) => doc.replace(/[.\s-]/g, "").trim().toUpperCase();

const nonEmpty = (max: number, label: string) =>
  z.string().trim().min(1, `${label} es obligatorio.`).max(max, `${label} es demasiado largo.`);

export const teamInfoSchema = z.object({
  name: nonEmpty(80, "El nombre del equipo"),
  shortName: z.string().trim().max(20).optional().or(z.literal("")),
  clubTag: z.string().trim().max(40).optional().or(z.literal("")),
});

export const managerSchema = z.object({
  contactName: nonEmpty(80, "El nombre del responsable"),
  contactEmail: z.string().trim().toLowerCase().email("Email del responsable inválido.").max(120),
  contactPhone: nonEmpty(30, "El teléfono del responsable"),
});

export const playerSchema = z.object({
  firstName: nonEmpty(60, "El nombre"),
  lastName: nonEmpty(60, "El apellido"),
  docType: z.enum(["DNI", "PASSPORT"]).default("DNI"),
  docNumber: nonEmpty(20, "El documento").transform(normalizeDoc),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de nacimiento inválida.")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Fecha de nacimiento inválida."),
  gender: z.enum(["M", "F", "X"]),
  /** false = acompaña al equipo pero no juega. Cuenta para el precio y el plantel; no para la cancha. */
  isPlayer: z.boolean().default(true),
  shirtNumber: z
    .union([z.coerce.number().int().min(0).max(999), z.literal("").transform(() => undefined)])
    .optional(),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  email: z.union([z.string().trim().toLowerCase().email(), z.literal("")]).optional(),
  position: z.string().trim().max(40).optional().or(z.literal("")),
});

export const registrationSubmitSchema = z.object({
  team: teamInfoSchema,
  manager: managerSchema,
  players: z.array(playerSchema).min(1, "Cargá al menos un jugador."),
});

export type TeamInfoInput = z.infer<typeof teamInfoSchema>;
export type ManagerInput = z.infer<typeof managerSchema>;
export type PlayerInput = z.infer<typeof playerSchema>;
export type RegistrationSubmitInput = z.infer<typeof registrationSubmitSchema>;
