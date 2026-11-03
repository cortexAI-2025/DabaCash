import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ListingStatus, Prisma } from "@dabacash/database";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";
import { CreateListingDto, ListingListQueryDto, UpdateListingDto } from "./dto/product.dto";

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService
  ) {}

  private async myFranchise(ownerId: string) {
    const franchise = await this.prisma.franchise.findUnique({ where: { ownerId } });
    if (!franchise) throw new NotFoundException("Aucune franchise rattachée à ce compte");
    return franchise;
  }

  async create(franchiseOwnerId: string, dto: CreateListingDto) {
    const franchise = await this.myFranchise(franchiseOwnerId);
    if (franchise.status !== "ACTIVE") throw new ForbiddenException("Votre franchise n'est pas active");
    if (dto.listingPrice < dto.buybackPrice) throw new BadRequestException("Le prix de vente doit être au moins égal au prix de rachat");

    const model = await this.prisma.deviceModel.findFirst({ where: { id: dto.deviceModelId, isActive: true } });
    if (!model) throw new BadRequestException("Modèle inconnu ou désactivé");

    // Listing and inventory are one fact: both rows or none.
    const listing = await this.prisma.$transaction(async (tx) => {
      const created = await tx.productListing.create({
        data: {
          franchiseId: franchise.id,
          deviceModelId: dto.deviceModelId,
          condition: dto.condition,
          title: dto.title,
          description: dto.description,
          buybackPrice: dto.buybackPrice,
          listingPrice: dto.listingPrice,
          originalPrice: dto.originalPrice,
          stockQuantity: dto.stockQuantity,
          images: dto.images,
          isNegotiable: dto.isNegotiable ?? false,
          warrantyMonths: dto.warrantyMonths ?? 0,
          status: ListingStatus.ACTIVE,
        },
      });
      await tx.inventory.create({
        data: { franchiseId: franchise.id, listingId: created.id, deviceModelId: dto.deviceModelId, quantity: dto.stockQuantity },
      });
      return created;
    });
    await this.realtime.publishStock([listing.id]);
    return listing;
  }

  async findByFranchise(franchiseOwnerId: string, q: ListingListQueryDto) {
    const franchise = await this.myFranchise(franchiseOwnerId);
    const where: Prisma.ProductListingWhereInput = { franchiseId: franchise.id, ...(q.status && { status: q.status }) };
    const [items, total] = await Promise.all([
      this.prisma.productListing.findMany({
        where,
        include: { deviceModel: { include: { brand: true } }, inventory: { select: { quantity: true, reserved: true } } },
        orderBy: { createdAt: "desc" },
        ...skipTake(q.page, q.limit),
      }),
      this.prisma.productListing.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  async update(listingId: string, franchiseOwnerId: string, dto: UpdateListingDto) {
    const franchise = await this.myFranchise(franchiseOwnerId);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Lock the stock row: an order reserving units concurrently cannot slip under a stock edit.
      await tx.$queryRaw`SELECT id FROM inventory WHERE "listingId" = ${listingId} FOR UPDATE`;
      const listing = await tx.productListing.findUnique({ where: { id: listingId }, include: { inventory: true } });
      if (!listing || listing.franchiseId !== franchise.id) throw new NotFoundException("Annonce introuvable");

      if (dto.listingPrice !== undefined && dto.listingPrice < listing.buybackPrice) {
        throw new BadRequestException("Le prix de vente doit rester au moins égal au prix de rachat");
      }
      if (dto.stockQuantity !== undefined) {
        const reserved = listing.inventory?.reserved ?? 0;
        if (dto.stockQuantity < reserved) {
          throw new ConflictException(`${reserved} unité(s) sont réservées par des commandes en cours : le stock ne peut pas descendre sous ce nombre`);
        }
      }

      const { stockQuantity, ...rest } = dto;
      const data: Prisma.ProductListingUpdateInput = { ...rest };
      if (stockQuantity !== undefined) {
        data.stockQuantity = stockQuantity;
        // A sold-out listing comes back on sale when units are added.
        if (listing.status === ListingStatus.SOLD && stockQuantity > 0 && !dto.status) data.status = ListingStatus.ACTIVE;
        await tx.inventory.update({ where: { listingId }, data: { quantity: stockQuantity } });
      }
      return tx.productListing.update({ where: { id: listingId }, data });
    });

    if (dto.stockQuantity !== undefined) await this.realtime.publishStock([listingId]);
    return updated;
  }

  async remove(listingId: string, franchiseOwnerId: string) {
    return this.update(listingId, franchiseOwnerId, { status: ListingStatus.ARCHIVED });
  }
}
