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
import { PrismaService } from "../common/prisma/prisma.service";
import { CreateOrderDto } from "./dto/order.dto";
import { recordCommission } from "./commission";
import { RealtimeService } from "../realtime/realtime.service";
import { NotificationsService } from "../notifications/notifications.service";

const { PENDING, CONFIRMED, IN_TRANSIT, DELIVERED, CANCELLED, REFUNDED } = OrderStatus;

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
    private notifications: NotificationsService
  ) {}

  async create(customerId: string, dto: CreateOrderDto) {
    if (dto.deliveryMethod === DeliveryMethod.COURIER && !dto.deliveryAddress) {
      throw new BadRequestException("Une adresse de livraison est requise");
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
          deliveryAddress: dto.deliveryAddress,
          totalAmount,
          notes: dto.notes,
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
        include: {
          items: { include: { listing: { include: { deviceModel: { include: { brand: true } } } } } },
          payment: true,
          franchise: { select: { name: true, city: true, address: true } },
        },
      });

      for (const item of dto.items) {
        await tx.inventory.update({
          where: { listingId: item.listingId },
          data: { reserved: { increment: item.quantity } },
        });
      }
      return order;
    });

    await this.realtime.publishStock(ids);
    return created;
  }

  async findByCustomer(customerId: string) {
    return this.prisma.order.findMany({
      where: { customerId },
      include: {
        items: { include: { listing: { include: { deviceModel: { include: { brand: true } } } } } },
        payment: true,
        franchise: { select: { name: true, city: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findByFranchise(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });
    return this.prisma.order.findMany({
      where: { franchiseId: franchise.id },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
        items: { include: { listing: true } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findAll() {
    return this.prisma.order.findMany({
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        franchise: { select: { name: true, city: true } },
        items: { include: { listing: { select: { title: true, listingPrice: true } } } },
        payment: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /**
   * Moves an order through its lifecycle. Franchise owners may only act on their own orders.
   * Stock is released on cancellation and consumed on delivery; commission is recorded once settled.
   */
  async updateStatus(orderId: string, next: OrderStatus, actor: { id: string; role: Role }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true, payment: true, franchise: { select: { ownerId: true } } },
      });
      if (!order) throw new NotFoundException("Commande introuvable");
      if (actor.role === Role.FRANCHISE_OWNER && order.franchise.ownerId !== actor.id) {
        throw new ForbiddenException("Cette commande appartient à une autre franchise");
      }

      if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
        throw new ConflictException(`Transition ${order.status} → ${next} interdite`);
      }

      const paid = order.payment?.status === PaymentStatus.COMPLETED;
      const inStore = order.payment?.method === PaymentMethod.CASH;

      if (next === CONFIRMED && !paid && !inStore) {
        throw new BadRequestException("Commande non payée : confirmation impossible");
      }
      if (next === CANCELLED && paid) {
        // Money has been taken; cancelling must go through a refund, not a status change.
        throw new ConflictException("Commande payée : rembourser avant d'annuler");
      }

      await tx.order.update({
        where: { id: orderId },
        data: { status: next, ...(next === DELIVERED && { deliveredAt: new Date() }) },
      });

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

      const updated = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true, payment: true },
      });
      return { updated, customerId: order.customerId, listingIds: order.items.map((i) => i.listingId) };
    });

    // After commit: listeners and the customer only ever see state that is really persisted.
    if (next === CANCELLED || next === DELIVERED) await this.realtime.publishStock(result.listingIds);
    const notice = ORDER_NOTICE[next];
    if (notice) {
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

  async findById(orderId: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: {
        customer: { select: { firstName: true, lastName: true, email: true } },
        items: { include: { listing: { include: { deviceModel: { include: { brand: true } } } } } },
        payment: true,
        franchise: { select: { name: true, city: true, address: true, phoneNumber: true } },
      },
    });
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
