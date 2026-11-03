import { Injectable } from "@nestjs/common";
import { paginated, PaginationQueryDto, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getForFranchise(franchiseOwnerId: string, q: PaginationQueryDto) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({ where: { ownerId: franchiseOwnerId } });
    const where = { franchiseId: franchise.id };
    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        include: { listing: { include: { deviceModel: { include: { brand: true } } } } },
        orderBy: { updatedAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  async getStockSummary(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({ where: { ownerId: franchiseOwnerId } });
    const base = { franchiseId: franchise.id, listing: { status: { in: ["ACTIVE", "SOLD"] as ("ACTIVE" | "SOLD")[] } } };
    const [total, lowStock, outOfStock] = await Promise.all([
      this.prisma.inventory.count({ where: base }),
      this.prisma.inventory.count({ where: { ...base, quantity: { lte: 2, gt: 0 } } }),
      this.prisma.inventory.count({ where: { ...base, quantity: 0 } }),
    ]);
    return { total, lowStock, outOfStock };
  }
}
