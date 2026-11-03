import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Condition, DeviceType } from "@dabacash/database";
import { PrismaService } from "../common/prisma/prisma.service";

export interface PriceEstimate {
  buybackPrice: number;
  buybackMin: number;
  buybackMax: number;
  resaleMin: number;
  resaleMax: number;
  expectedMargin: number;
}

// Condition multipliers for buyback (fraction of market price)
const CONDITION_BUYBACK_RANGE: Record<Condition, [number, number]> = {
  A: [0.50, 0.65], // Excellent
  B: [0.38, 0.52], // Good
  C: [0.25, 0.38], // Fair
  D: [0.10, 0.22], // Poor
};

// Resale multiplier over buyback price
const RESALE_MULTIPLIER_RANGE: Record<DeviceType, [number, number]> = {
  PHONE: [1.25, 1.65],
  LAPTOP: [1.20, 1.55],
  TV: [1.15, 1.45],
  TABLET: [1.20, 1.55],
  ACCESSORY: [1.30, 1.80],
  OTHER: [1.20, 1.50],
};

// Age depreciation factor per year (max 5 years)
function ageDepreciation(releaseYear: number | null): number {
  if (!releaseYear) return 1;
  const age = new Date().getFullYear() - releaseYear;
  const clampedAge = Math.min(age, 5);
  return Math.max(0.6, 1 - clampedAge * 0.08);
}

/** Pure pricing rule: same inputs, same outputs. Whole-dirham results (Aslan/NAPS only accepts whole MAD). */
export function computeEstimate(
  model: { baseMarketPrice: number; releaseYear: number | null; deviceType: DeviceType },
  condition: Condition
): PriceEstimate {
  const effectiveMarketPrice = model.baseMarketPrice * ageDepreciation(model.releaseYear);
  const [buybackLow, buybackHigh] = CONDITION_BUYBACK_RANGE[condition];
  const [resaleLow, resaleHigh] = RESALE_MULTIPLIER_RANGE[model.deviceType];

  const buybackMin = Math.round(effectiveMarketPrice * buybackLow);
  const buybackMax = Math.round(effectiveMarketPrice * buybackHigh);
  const buybackPrice = Math.round((buybackMin + buybackMax) / 2);
  const resaleMin = Math.round(buybackPrice * resaleLow);
  const resaleMax = Math.round(buybackPrice * resaleHigh);

  return { buybackPrice, buybackMin, buybackMax, resaleMin, resaleMax, expectedMargin: resaleMin - buybackPrice };
}

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  /**
   * Read-only: an anonymous caller must not be able to write to the database.
   * Price history is recorded when an admin changes a model's baseline, not on every estimate.
   */
  async estimate(params: { deviceModelId: string; condition: Condition }): Promise<PriceEstimate> {
    const model = await this.prisma.deviceModel.findUniqueOrThrow({ where: { id: params.deviceModelId } });
    return this.estimateFor(model, params.condition);
  }

  estimateFor(
    model: { isActive: boolean; baseMarketPrice: number | null; releaseYear: number | null; deviceType: DeviceType },
    condition: Condition
  ): PriceEstimate {
    if (!model.isActive) throw new NotFoundException("Modèle introuvable");
    if (!model.baseMarketPrice || model.baseMarketPrice <= 0) {
      // A model without a market baseline would otherwise quote 0 MAD.
      throw new UnprocessableEntityException("Estimation indisponible pour ce modèle pour le moment");
    }
    return computeEstimate({ ...model, baseMarketPrice: model.baseMarketPrice }, condition);
  }

  async estimateByModelSlug(params: {
    brandSlug: string;
    modelSlug: string;
    condition: Condition;
  }): Promise<PriceEstimate & { modelName: string; brandName: string }> {
    const model = await this.prisma.deviceModel.findFirstOrThrow({
      where: { slug: params.modelSlug, brand: { slug: params.brandSlug } },
      include: { brand: true },
    });
    return { ...this.estimateFor(model, params.condition), modelName: model.name, brandName: model.brand.name };
  }
}
