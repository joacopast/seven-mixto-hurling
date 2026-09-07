import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface AuditInput {
  tournamentId?: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  previousValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * Registra una acción crítica. Debe llamarse DENTRO de la misma transacción
 * que la mutación que audita (pasar el tx client).
 */
export async function writeAudit(tx: Tx, input: AuditInput): Promise<void> {
  await tx.auditLog.create({
    data: {
      tournamentId: input.tournamentId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      previousValue: input.previousValue ?? undefined,
      newValue: input.newValue ?? undefined,
      ip: input.ip ?? null,
    },
  });
}
