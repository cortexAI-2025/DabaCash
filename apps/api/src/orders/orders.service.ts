import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CreateOrderDto } from "./dto/order.dto";
import { OrderStatus } from "@dabacash/database";

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(customerId: string, dto: CreateOrderDto) {
    // Validate all listings exist and have stock
    const listings = await Promise.all(
      dto.items.map((item) =>
        this.prisma.productListing.findUniqueOrThrow({
          where: { id: item.listingId },
          include: { inventory: true, franchise: true },
        })
      )
    );

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      const requestedQty = dto.items[i].quantity;
      const available = (listing.inventory?.quantity ?? 0) - (listing.inventory?.reserved ?? 0);
      if (available < requestedQty) {
        throw new BadRequestException(`Insufficient stock for listing ${listing.title}`);
      }
    }

    // All items must be from same franchise (simplified)
    const franchiseId = listings[0].franchiseId;

    const totalAmount = listings.reduce((sum, listing, i) => {
      return sum + listing.listingPrice * dto.items[i].quantity;
    }, 0);

    // Create order
    const order = await this.prisma.order.create({
      data: {
        customerId,
        franchiseId,
        deliveryMethod: dto.deliveryMethod,
        deliveryAddress: dto.deliveryAddress,
        totalAmount,
        notes: dto.notes,
        items: {
          create: dto.items.map((item, i) => ({
            listingId: item.listingId,
            quantity: item.quantity,
            unitPrice: listings[i].listingPrice,
            totalPrice: listings[i].listingPrice * item.quantity,
          })),
        },
        payment: {
          create: {
            userId: customerId,
            method: dto.paymentMethod,
            amount: totalAmount,
          },
        },
      },
      include: {
        items: { include: { listing: { include: { deviceModel: { include: { brand: true } } } } } },
        payment: true,
        franchise: { select: { name: true, city: true, address: true } },
      },
    });

    // Reserve stock
    await Promise.all(
      dto.items.map((item) =>
        this.prisma.inventory.update({
          where: { listingId: item.listingId },
          data: { reserved: { increment: item.quantity } },
        })
      )
    );

    // Create commission record
    const franchise = listings[0].franchise;
    await this.prisma.commission.create({
      data: {
        orderId: order.id,
        franchiseId,
        saleAmount: totalAmount,
        rate: franchise.commissionRate,
        amount: totalAmount * franchise.commissionRate,
      },
    });

    return order;
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

  async updateStatus(orderId: string, status: OrderStatus) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(status === OrderStatus.DELIVERED && { deliveredAt: new Date() }),
      },
    });
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
}
