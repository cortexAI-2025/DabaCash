import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  DeliveryMethod,
  ListingStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  Role,
} from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { AdminOrderQueryDto, CreateOrderDto, OrderListQueryDto } from "./dto/order.dto";
import { recordCommission } from "./commission";
import { lockOrder } from "./order-lock";
import { RealtimeService } from "../realtime/realtime.service";
import { NotificationsService } from "../notifications/notifications.service";

const { PENDING, CONFIRMED, IN_TRANSIT, DELIVERED, CANCELLED } = OrderStatus;

// Refunds are handled outside this endpoint (Aslan dashboard), so REFUNDED is terminal here.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [CONFIRMED, CANCELLED],
  CONFIRMED: [IN_TRANSIT, DELIVERED, CANCELLED],
  IN_TRANSIT: [DELIVERED, CANCELLED],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

// Unpaid online orders hold stock for 2 hours (Aslan checkout TTL is 30 min);
// cash orders hold it for 48 hours (Aslan cash TTL).
const ONLINE_HOLD_MS = 2 * 60 * 60 * 1000;
const CASH_HOLD_MS = 48 * 60 * 60 * 1000;

type OrderItemRow = { listingId: string; quantity: number };

// A listing as the buyer sees it: no purchase price (the franchise's margin), no model baseline.
const BUYER_LISTING = {
  select: { id: true, title: true, images: true, condition: true, listingPrice: true, warrantyMonths: true, deviceModel: { select: { name: true, brand: { select: { name: true } } } } },
} as const;

const ORDER_VIEW = {
  items: { include: { listing: BUYER_LISTING } },
  payment: true,
  franchise: { select: { name: true, city: true, address: true } },
} satisfies Prisma.OrderInclude;

const ORDER_NOTICE: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  CONFIRMED: { title: "Commande confirmée", body: "Votre commande a été confirmée par la franchise." },
  IN_TRANSIT: { title: "Commande en route", body: "Votre commande est en cours de livraison." },
  DELIVERED: { title: "Commande livrée", body: "Votre commande a été remise. Merci de votre confiance !" },
  CANCELLED: { title: "Commande annulée", body: "Votre commande a été annulée et le stock libéré." },
};

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
    private audit: AuditService
  ) {}

  async create(customerId: string, dto: CreateOrderDto, idempotencyKey?: string) {
    if (dto.deliveryMethod === DeliveryMethod.COURIER) {
      if (!dto.deliveryAddress) throw new BadRequestException("Une adresse de livraison est requise");
      if (dto.paymentMethod !== PaymentMethod.ASLAN) {
        throw new BadRequestException("La livraison à domicile nécessite un paiement en ligne");
      }
    }

    const ids = dto.items.map((i) => i.listingId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException("Un article ne peut apparaître qu'une fois par commande");
    }

    const listings = await this.prisma.productListing.findMany({
      where: { id: { in: ids } },
      include: { franchise: { select: { commissionRate: true } } },
    });
    if (listings.length !== ids.length) throw new NotFoundException("Article introuvable");

    // An order is settled by a single franchise: a mixed basket is rejected, not silently re-assigned.
    if (new Set(listings.map((l) => l.franchiseId)).size > 1) {
      throw new BadRequestException(
        "Une commande ne peut contenir que des articles d'une même franchise. Passez une commande par franchise."
      );
    }
    if (listings.some((l) => l.status !== ListingStatus.ACTIVE)) {
      throw new BadRequestException("Un article n'est plus disponible");
    }

    const byId = new Map(listings.map((l) => [l.id, l]));
    const franchiseId = listings[0].franchiseId;

    const created = await this.prisma.$transaction(async (tx) => {
      // Lock the stock rows so two concurrent checkouts cannot both reserve the last unit.
      await this.lockInventory(tx, ids);

      // Checked after the lock is held: a concurrent duplicate waits here until the first request
      // has committed, then returns that order instead of failing on "insufficient stock".
      if (idempotencyKey) {
        const existing = await tx.order.findUnique({
          where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
          include: ORDER_VIEW,
        });
        if (existing) return { order: existing, replay: true };
      }

      const inventories = await tx.inventory.findMany({ where: { listingId: { in: ids } } });

      for (const item of dto.items) {
        const inv = inventories.find((i) => i.listingId === item.listingId);
        const available = (inv?.quantity ?? 0) - (inv?.reserved ?? 0);
        if (available < item.quantity) {
          throw new BadRequestException(`Stock insuffisant pour ${byId.get(item.listingId)!.title}`);
        }
      }

      const totalAmount = dto.items.reduce(
        (sum, i) => sum + byId.get(i.listingId)!.listingPrice * i.quantity,
        0
      );

      const order = await tx.order.create({
        data: {
          customerId,
          franchiseId,
          deliveryMethod: dto.deliveryMethod,
          deliveryAddress: dto.deliveryAddress ? { ...dto.deliveryAddress } : undefined,
          totalAmount,
          notes: dto.notes,
          idempotencyKey,
          items: {
            create: dto.items.map((item) => {
              const listing = byId.get(item.listingId)!;
              return {
                listingId: item.listingId,
                quantity: item.quantity,
                unitPrice: listing.listingPrice,
                totalPrice: listing.listingPrice * item.quantity,
              };
            }),
          },
          payment: {
            create: { userId: customerId, method: dto.paymentMethod, amount: totalAmount },
          },
        },
        include: ORDER_VIEW,
      });

      for (const item of dto.items) {
        await tx.inventory.update({
          where: { listingId: item.listingId },
          data: { reserved: { increment: item.quantity } },
        });
      }
      return { order, replay: false };
    });

    if (!created.replay) await this.realtime.publishStock(ids);
    return created.order;
  }

  async findByCustomer(customerId: string, q: OrderListQueryDto) {
    const where: Prisma.OrderWhereInput = { customerId, ...(q.status && { status: q.status }) };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: ORDER_VIEW, orderBy: { createdAt: "desc" }, ...skipTake(q.page, q.limit) }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  async findByFranchise(franchiseOwnerId: string, q: OrderListQueryDto) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({ where: { ownerId: franchiseOwnerId } });
    const where: Prisma.OrderWhereInput = { franchiseId: franchise.id, ...(q.status && { status: q.status }) };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
          items: { include: { listing: true } },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  async findAll(q: AdminOrderQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.OrderWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.paymentStatus && { payment: { is: { status: q.paymentStatus } } }),
      ...((q.from || q.to) && { createdAt: { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) } }),
      ...(search && { OR: [{ id: { endsWith: search } }, { customer: { email: { contains: search, mode: "insensitive" as const } } }] }),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true, email: true } },
          franchise: { select: { name: true, city: true } },
          items: { include: { listing: { select: { title: true, listingPrice: true } } } },
          payment: true,
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  /**
   * Moves an order through its lifecycle. Franchise owners may only act on their own orders.
   * Stock is released on cancellation and consumed on delivery; commission is recorded once settled.
   */
  async updateStatus(orderId: string, next: OrderStatus, actor: { id: string; role: Role }) {
    const result = await this.prisma.$transaction(async (tx) => {
      // Row lock first, always: a payment webhook, the expiry sweeper and a user action on the
      // same order are serialised, so none of them can act on a state that just changed.
      await lockOrder(tx, orderId);

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payment: true, franchise: { select: { ownerId: true } } },
      });
      if (!order) throw new NotFoundException("Commande introuvable");

      const byCustomer = actor.role === Role.CUSTOMER;
      if (byCustomer) {
        if (order.customerId !== actor.id) throw new NotFoundException("Commande introuvable"); // do not reveal it exists
        if (next !== CANCELLED) throw new ForbiddenException("Action non autorisée");
        if (order.payment?.status === PaymentStatus.COMPLETED || order.payment?.status === PaymentStatus.PROCESSING) {
          throw new ConflictException("Un paiement est en cours ou effectué : contactez la franchise");
        }
      } else if (actor.role === Role.FRANCHISE_OWNER && order.franchise.ownerId !== actor.id) {
        throw new ForbiddenException("Cette commande appartient à une autre franchise");
      }

      if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
        throw new ConflictException(`Transition ${order.status} → ${next} interdite`);
      }
      if (byCustomer && order.status !== PENDING) throw new ConflictException("Seule une commande en attente peut être annulée");

      const paid = order.payment?.status === PaymentStatus.COMPLETED;
      const inStore = order.payment?.method === PaymentMethod.CASH;

      if (next === CONFIRMED && !paid && !inStore) {
        throw new BadRequestException("Commande non payée : confirmation impossible");
      }
      if (next === CANCELLED && paid) {
        // Money has been taken; cancelling must go through a refund, not a status change.
        throw new ConflictException("Commande payée : rembourser avant d'annuler");
      }

      // Belt and braces next to the row lock: the move only applies from the state we validated.
      const { count } = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: { status: next, ...(next === DELIVERED && { deliveredAt: new Date() }) },
      });
      if (!count) throw new ConflictException("La commande a été modifiée entre-temps, réessayez");

      if (next === CANCELLED) {
        await this.releaseStock(tx, order.items);
        await tx.payment.updateMany({
          where: { orderId, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } },
          data: { status: PaymentStatus.FAILED },
        });
      }

      if (next === DELIVERED) {
        await this.consumeStock(tx, order.items);
        if (paid || inStore) await recordCommission(tx, orderId);
      }

      await this.audit.record(
        {
          actor,
          action: byCustomer ? AuditAction.ORDER_CANCELLED_BY_CUSTOMER : AuditAction.ORDER_STATUS_CHANGED,
          entity: "Order",
          entityId: orderId,
          metadata: { from: order.status, to: next },
        },
        tx
      );

      const updated = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, payment: true } });
      return { updated, customerId: order.customerId, listingIds: order.items.map((i) => i.listingId) };
    });

    // After commit: listeners and the customer only ever see state that is really persisted.
    if (next === CANCELLED || next === DELIVERED) await this.realtime.publishStock(result.listingIds);
    const notice = ORDER_NOTICE[next];
    if (notice && actor.role !== Role.CUSTOMER) {
      await this.notifications.notify(result.customerId, { ...notice, type: "order_update", data: { orderId } });
    }
    return result.updated;
  }

  /** Cancels unpaid orders whose hold has expired and returns their stock. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStaleOrders(now = new Date()) {
    const candidates = await this.prisma.order.findMany({
      where: {
        status: PENDING,
        createdAt: { lt: new Date(now.getTime() - ONLINE_HOLD_MS) },
        payment: { is: { status: { not: PaymentStatus.COMPLETED } } },
      },
      select: { id: true, customerId: true, createdAt: true, payment: { select: { method: true } } },
    });

    let expired = 0;
    for (const o of candidates) {
      const isCash = o.payment?.method === PaymentMethod.CASH;
      if (isCash && o.createdAt.getTime() > now.getTime() - CASH_HOLD_MS) continue;

      const released = await this.prisma.$transaction(async (tx) => {
        // Conditional on PENDING so a payment confirmed in the meantime is never cancelled.
        const { count } = await tx.order.updateMany({
          where: { id: o.id, status: PENDING },
          data: { status: CANCELLED },
        });
        if (!count) return null;
        const items = await tx.orderItem.findMany({ where: { orderId: o.id } });
        await this.releaseStock(tx, items);
        await tx.payment.updateMany({
          where: { orderId: o.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] } },
          data: { status: PaymentStatus.FAILED },
        });
        return items.map((i) => i.listingId);
      });
      if (released) {
        expired++;
        await this.realtime.publishStock(released);
        await this.notifications.notify(o.customerId, {
          title: "Commande expirée",
          body: "Votre commande n'a pas été réglée à temps et a été annulée. Vous pouvez la repasser depuis le marketplace.",
          type: "order_update",
          data: { orderId: o.id },
        });
      }
    }
    if (expired) this.logger.log(`Expired ${expired} unpaid order(s), stock released`);
    return expired;
  }

  /** Visible to the customer who placed it, the franchise that fulfils it, and admins. Anyone else gets a 404. */
  async findById(orderId: string, actor: { id: string; role: Role }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        items: { include: { listing: BUYER_LISTING } },
        payment: true,
        franchise: { select: { name: true, city: true, address: true, phoneNumber: true, ownerId: true } },
      },
    });
    const allowed =
      !!order &&
      (actor.role === Role.ADMIN ||
        order.customerId === actor.id ||
        (actor.role === Role.FRANCHISE_OWNER && order.franchise.ownerId === actor.id));
    if (!order || !allowed) throw new NotFoundException("Commande introuvable");

    const { ownerId: _omit, ...franchise } = order.franchise;
    return { ...order, franchise };
  }

  private lockInventory(tx: Prisma.TransactionClient, listingIds: string[]) {
    return tx.$queryRaw`SELECT id FROM inventory WHERE "listingId" IN (${Prisma.join(listingIds)}) FOR UPDATE`;
  }

  private async releaseStock(tx: Prisma.TransactionClient, items: OrderItemRow[]) {
    for (const item of items) {
      await tx.inventory.update({
        where: { listingId: item.listingId },
        data: { reserved: { decrement: item.quantity } },
      });
    }
  }

  private async consumeStock(tx: Prisma.TransactionClient, items: OrderItemRow[]) {
    for (const item of items) {
      await tx.inventory.update({
        where: { listingId: item.listingId },
        data: { quantity: { decrement: item.quantity }, reserved: { decrement: item.quantity } },
      });
      const listing = await tx.productListing.update({
        where: { id: item.listingId },
        data: { stockQuantity: { decrement: item.quantity }, soldCount: { increment: item.quantity } },
      });
      if (listing.stockQuantity <= 0) {
        await tx.productListing.update({
          where: { id: item.listingId },
          data: { status: ListingStatus.SOLD },
        });
      }
    }
  }
}
