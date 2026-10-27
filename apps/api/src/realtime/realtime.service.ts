import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { RealtimeGateway } from "./realtime.gateway";

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: RealtimeGateway
  ) {}

  /** Re-reads committed stock and pushes it to listeners. Never throws: it must not fail an order. */
  async publishStock(listingIds: string[]) {
    if (!listingIds.length) return;
    try {
      const rows = await this.prisma.inventory.findMany({
        where: { listingId: { in: listingIds } },
        select: { listingId: true, franchiseId: true, quantity: true, reserved: true },
      });
      for (const r of rows) {
        this.gateway.emitStock({
          listingId: r.listingId,
          franchiseId: r.franchiseId,
          available: Math.max(0, r.quantity - r.reserved),
        });
      }
    } catch (err) {
      this.logger.warn(`Stock broadcast failed: ${(err as Error).message}`);
    }
  }
}
