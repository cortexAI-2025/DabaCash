import { Prisma } from "@dabacash/database";

/**
 * Takes the order's row lock. Every code path that changes an order's state (customer action,
 * franchise action, payment webhook, expiry sweeper) acquires it FIRST, so they are serialised
 * and cannot deadlock on different lock orders.
 */
export function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  return tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
}
