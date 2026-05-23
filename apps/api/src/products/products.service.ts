import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { CreateListingDto, UpdateListingDto } from "./dto/product.dto";

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(franchiseOwnerId: string, dto: CreateListingDto) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });

    const listing = await this.prisma.productListing.create({
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
        specs: dto.specs,
        isNegotiable: dto.isNegotiable ?? false,
        warrantyMonths: dto.warrantyMonths ?? 0,
        status: "ACTIVE",
      },
    });

    // Create / update inventory record
    await this.prisma.inventory.create({
      data: {
        franchiseId: franchise.id,
        listingId: listing.id,
        deviceModelId: dto.deviceModelId,
        quantity: dto.stockQuantity,
      },
    });

    return listing;
  }

  async findByFranchise(franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });

    return this.prisma.productListing.findMany({
      where: { franchiseId: franchise.id },
      include: {
        deviceModel: { include: { brand: true } },
        inventory: { select: { quantity: true, reserved: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(listingId: string, franchiseOwnerId: string, dto: UpdateListingDto) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });
    const listing = await this.prisma.productListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    if (listing.franchiseId !== franchise.id) {
      throw new ForbiddenException("Not your listing");
    }

    const updated = await this.prisma.productListing.update({
      where: { id: listingId },
      data: dto,
    });

    if (dto.stockQuantity !== undefined) {
      await this.prisma.inventory.update({
        where: { listingId },
        data: { quantity: dto.stockQuantity },
      });
    }

    return updated;
  }

  async remove(listingId: string, franchiseOwnerId: string) {
    const franchise = await this.prisma.franchise.findUniqueOrThrow({
      where: { ownerId: franchiseOwnerId },
    });
    const listing = await this.prisma.productListing.findUniqueOrThrow({
      where: { id: listingId },
    });
    if (listing.franchiseId !== franchise.id) {
      throw new ForbiddenException("Not your listing");
    }

    return this.prisma.productListing.update({
      where: { id: listingId },
      data: { status: "ARCHIVED" },
    });
  }
}
