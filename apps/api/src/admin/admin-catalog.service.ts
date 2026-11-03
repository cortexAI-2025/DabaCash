import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Condition, Prisma, Role } from "@dabacash/database";
import { AuditAction, AuditService } from "../audit/audit.service";
import { paginated, skipTake } from "../common/pagination";
import { PrismaService } from "../common/prisma/prisma.service";
import { computeEstimate } from "../pricing/pricing.service";
import { CatalogQueryDto, CreateModelDto, UpdateModelDto } from "./dto/admin.dto";

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const CONDITIONS: Condition[] = ["A", "B", "C", "D"];
type Admin = { id: string };

/**
 * The market baseline of a model is the one number that drives every buyback offer.
 * It is editable here, every change is audited, and a history row per condition is kept.
 */
@Injectable()
export class AdminCatalogService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService
  ) {}

  async listModels(q: CatalogQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.DeviceModelWhereInput = {
      ...(q.deviceType && { deviceType: q.deviceType }),
      ...(search && { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { brand: { name: { contains: search, mode: "insensitive" as const } } }] }),
    };
    const [items, total] = await Promise.all([
      this.prisma.deviceModel.findMany({ where, include: { brand: { select: { name: true, slug: true } } }, orderBy: [{ brand: { name: "asc" } }, { name: "asc" }], ...skipTake(q.page, q.limit) }),
      this.prisma.deviceModel.count({ where }),
    ]);
    return paginated(items, total, q.page, q.limit);
  }

  async createModel(admin: Admin, dto: CreateModelDto) {
    const brandSlug = slugify(dto.brandName);
    const slug = slugify(dto.name);
    if (!brandSlug || !slug) throw new ConflictException("Nom invalide");

    return this.prisma.$transaction(async (tx) => {
      const brand = await tx.brand.upsert({ where: { slug: brandSlug }, update: {}, create: { name: dto.brandName, slug: brandSlug } });
      if (await tx.deviceModel.findUnique({ where: { brandId_slug: { brandId: brand.id, slug } } })) {
        throw new ConflictException("Ce modèle existe déjà pour cette marque");
      }
      const model = await tx.deviceModel.create({
        data: { brandId: brand.id, name: dto.name, slug, deviceType: dto.deviceType, releaseYear: dto.releaseYear, baseMarketPrice: dto.baseMarketPrice },
        include: { brand: { select: { name: true, slug: true } } },
      });
      await this.recordPriceHistory(tx, model);
      await this.audit.record({ actor: { id: admin.id, role: Role.ADMIN }, action: AuditAction.CATALOG_MODEL_CREATED, entity: "DeviceModel", entityId: model.id, metadata: { baseMarketPrice: dto.baseMarketPrice } }, tx);
      return model;
    });
  }

  async updateModel(admin: Admin, id: string, dto: UpdateModelDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.deviceModel.findUnique({ where: { id } });
      if (!before) throw new NotFoundException("Modèle introuvable");

      const model = await tx.deviceModel.update({ where: { id }, data: dto, include: { brand: { select: { name: true, slug: true } } } });
      if (dto.baseMarketPrice !== undefined && dto.baseMarketPrice !== before.baseMarketPrice) {
        await this.recordPriceHistory(tx, model);
        await this.audit.record({ actor: { id: admin.id, role: Role.ADMIN }, action: AuditAction.CATALOG_PRICE_CHANGED, entity: "DeviceModel", entityId: id, metadata: { from: before.baseMarketPrice, to: dto.baseMarketPrice } }, tx);
      }
      return model;
    });
  }

  private async recordPriceHistory(
    tx: Prisma.TransactionClient,
    model: { id: string; baseMarketPrice: number | null; releaseYear: number | null; deviceType: any }
  ) {
    if (!model.baseMarketPrice) return;
    await tx.priceHistory.createMany({
      data: CONDITIONS.map((condition) => {
        const e = computeEstimate({ baseMarketPrice: model.baseMarketPrice!, releaseYear: model.releaseYear, deviceType: model.deviceType }, condition);
        return { deviceModelId: model.id, condition, marketPrice: model.baseMarketPrice!, buybackMin: e.buybackMin, buybackMax: e.buybackMax, resaleMin: e.resaleMin, resaleMax: e.resaleMax, source: "admin" };
      }),
    });
  }
}
