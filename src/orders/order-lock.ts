import { Prisma } from '@prisma/client';

/**
 * Transaction-scoped advisory lock. Everything that changes one order (dispatch, accept, cancel,
 * status update) takes this lock first, so two requests can never change the same order at once,
 * even across several server instances. The lock is released automatically at commit or rollback.
 */
export async function advisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
