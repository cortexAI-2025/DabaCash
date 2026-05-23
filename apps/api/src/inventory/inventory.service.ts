import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getForFranchise(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });

    return this.prisma.inventory.findMany({
      where: { franchiseId: franchise.id },
      include: {
        listing: {
          include: { deviceModel: { include: { brand: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getStockSummary(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });

    const [total, lowStock, outOfStock] = await Promise.all([
      this.prisma.inventory.count({ where: { franchiseId: franchise.id } }),
      this.prisma.inventory.count({
        where: { franchiseId: franchise.id, quantity: { lte: 2, gt: 0 } },
      }),
      this.prisma.inventory.count({
        where: { franchiseId: franchise.id, quantity: 0 },
      }),
    ]);

    return { total, lowStock, outOfStock };
  }

  async adjustStock(listingId: string, delta: number) {
    return this.prisma.inventory.update({
      where: { listingId },
      data: { quantity: { increment: delta } },
    });
  }
}
