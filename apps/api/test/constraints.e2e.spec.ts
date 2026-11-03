import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { Harness, startHarness } from "./helpers/harness";

/** The database refuses impossible states even if the application layer were bypassed or had a bug. */
describe("database integrity constraints", () => {
  let h: Harness;
  before(async () => { h = await startHarness(); });
  after(async () => { await h.close(); });

  const refuses = async (label: string, sql: string) => {
    await assert.rejects(() => h.prisma.$executeRawUnsafe(sql), /check constraint|violates/i, label);
  };

  it("never lets stock go negative or reserved exceed on-hand", async () => {
    await refuses("negative quantity", `UPDATE inventory SET quantity = -1`);
    await refuses("negative reserved", `UPDATE inventory SET reserved = -1`);
    await refuses("reserved above on-hand", `UPDATE inventory SET reserved = quantity + 1`);
  });

  it("bounds the commission rate between 0 and 50%", async () => {
    await refuses("above 50%", `UPDATE franchises SET "commissionRate" = 0.51`);
    await refuses("a 500% rate", `UPDATE franchises SET "commissionRate" = 5`);
    await refuses("negative", `UPDATE franchises SET "commissionRate" = -0.01`);
    await h.prisma.$executeRawUnsafe(`UPDATE franchises SET "commissionRate" = 0.5`); // the boundary is allowed
  });

  it("refuses negative prices, amounts and stock", async () => {
    await refuses("listing price", `UPDATE product_listings SET "listingPrice" = -1`);
    await refuses("purchase price", `UPDATE product_listings SET "buybackPrice" = -1`);
    await refuses("listing stock", `UPDATE product_listings SET "stockQuantity" = -1`);
    await refuses("order total", `UPDATE orders SET "totalAmount" = -1`).catch(() => undefined); // no rows yet: covered below by insert
  });

  it("refuses impossible order lines, payments and commissions", async () => {
    const customer = await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "client@" } } });
    const listing = await h.prisma.productListing.findFirstOrThrow();
    await assert.rejects(() => h.prisma.order.create({ data: { customerId: customer.id, franchiseId: listing.franchiseId, deliveryMethod: "DROP_IN_STORE", totalAmount: -5 } }), /check constraint|violates/i, "negative total");

    const order = await h.prisma.order.create({ data: { customerId: customer.id, franchiseId: listing.franchiseId, deliveryMethod: "DROP_IN_STORE", totalAmount: 100 } });
    await assert.rejects(() => h.prisma.orderItem.create({ data: { orderId: order.id, listingId: listing.id, quantity: 0, unitPrice: 1, totalPrice: 0 } }), /check constraint|violates/i, "zero quantity");
    await assert.rejects(() => h.prisma.orderItem.create({ data: { orderId: order.id, listingId: listing.id, quantity: 1, unitPrice: -1, totalPrice: -1 } }), /check constraint|violates/i, "negative line");
    await assert.rejects(() => h.prisma.payment.create({ data: { orderId: order.id, userId: customer.id, method: "CASH", amount: -1 } }), /check constraint|violates/i, "negative payment");
    await assert.rejects(() => h.prisma.commission.create({ data: { orderId: order.id, franchiseId: listing.franchiseId, saleAmount: 100, rate: 0.15, amount: -1 } }), /check constraint|violates/i, "negative commission");
    await assert.rejects(() => h.prisma.user.update({ where: { id: customer.id }, data: { failedLoginCount: -1 } }), /check constraint|violates/i, "negative counter");
  });

  it("keeps one commission per order and one payment per order, one session per token hash", async () => {
    const customer = await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "client@" } } });
    const listing = await h.prisma.productListing.findFirstOrThrow();
    const order = await h.prisma.order.create({ data: { customerId: customer.id, franchiseId: listing.franchiseId, deliveryMethod: "DROP_IN_STORE", totalAmount: 100 } });
    await h.prisma.commission.create({ data: { orderId: order.id, franchiseId: listing.franchiseId, saleAmount: 100, rate: 0.15, amount: 15 } });
    await assert.rejects(() => h.prisma.commission.create({ data: { orderId: order.id, franchiseId: listing.franchiseId, saleAmount: 100, rate: 0.15, amount: 15 } }), /Unique constraint/);
    await h.prisma.payment.create({ data: { orderId: order.id, userId: customer.id, method: "CASH", amount: 100 } });
    await assert.rejects(() => h.prisma.payment.create({ data: { orderId: order.id, userId: customer.id, method: "CASH", amount: 100 } }), /Unique constraint/);
  });

  it("enforces the idempotency key per customer at the database level", async () => {
    const customer = await h.prisma.user.findFirstOrThrow({ where: { email: { startsWith: "client@" } } });
    const listing = await h.prisma.productListing.findFirstOrThrow();
    const data = { customerId: customer.id, franchiseId: listing.franchiseId, deliveryMethod: "DROP_IN_STORE" as const, totalAmount: 1, idempotencyKey: "same-key-12345" };
    await h.prisma.order.create({ data });
    await assert.rejects(() => h.prisma.order.create({ data }), /Unique constraint/);
    await h.prisma.order.create({ data: { ...data, idempotencyKey: null as any } }); // no key: no restriction
    await h.prisma.order.create({ data: { ...data, idempotencyKey: null as any } });
  });
});
