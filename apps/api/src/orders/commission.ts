import { Prisma } from "@dabacash/database";

/**
 * Records the platform commission for an order. Idempotent (one row per order),
 * so it is safe to call from both the payment webhook and the delivery step.
 */
export async function recordCommission(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { franchise: { select: { commissionRate: true } } },
  });
  const rate = order.franchise.commissionRate;
  await tx.commission.upsert({
    where: { orderId },
    update: {},
    create: {
      orderId,
      franchiseId: order.franchiseId,
      saleAmount: order.totalAmount,
      rate,
      amount: order.totalAmount * rate,
    },
  });
}
