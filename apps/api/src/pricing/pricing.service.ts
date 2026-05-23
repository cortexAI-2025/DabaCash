import { Injectable } from "@nestjs/common";
import { Condition, DeviceType } from "@dabacash/database";
import { PrismaService } from "../common/prisma/prisma.service";

export interface PriceEstimate {
  buybackPrice: number;
  buybackMin: number;
  buybackMax: number;
  resaleMin: number;
  resaleMax: number;
  expectedMargin: number;
  confidenceScore: number; // 0-1
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

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  async estimate(params: {
    deviceModelId: string;
    condition: Condition;
    overrideMarketPrice?: number;
  }): Promise<PriceEstimate> {
    const model = await this.prisma.deviceModel.findUniqueOrThrow({
      where: { id: params.deviceModelId },
    });

    const marketPrice = params.overrideMarketPrice ?? model.baseMarketPrice ?? 0;
    const ageFactor = ageDepreciation(model.releaseYear);
    const effectiveMarketPrice = marketPrice * ageFactor;

    const [buybackLow, buybackHigh] = CONDITION_BUYBACK_RANGE[params.condition];
    const [resaleLow, resaleHigh] = RESALE_MULTIPLIER_RANGE[model.deviceType];

    const buybackMin = Math.round(effectiveMarketPrice * buybackLow);
    const buybackMax = Math.round(effectiveMarketPrice * buybackHigh);
    const buybackPrice = Math.round((buybackMin + buybackMax) / 2);

    const resaleMin = Math.round(buybackPrice * resaleLow);
    const resaleMax = Math.round(buybackPrice * resaleHigh);

    const expectedMargin = Math.round(resaleMin - buybackPrice);
    const confidenceScore = model.baseMarketPrice ? 0.85 : 0.55;

    // Persist to price history
    await this.prisma.priceHistory.create({
      data: {
        deviceModelId: model.id,
        condition: params.condition,
        marketPrice,
        buybackMin,
        buybackMax,
        resaleMin,
        resaleMax,
        source: "system",
      },
    });

    return { buybackPrice, buybackMin, buybackMax, resaleMin, resaleMax, expectedMargin, confidenceScore };
  }

  async estimateByModelSlug(params: {
    brandSlug: string;
    modelSlug: string;
    condition: Condition;
  }): Promise<PriceEstimate & { modelName: string; brandName: string }> {
    const model = await this.prisma.deviceModel.findFirstOrThrow({
      where: {
        slug: params.modelSlug,
        brand: { slug: params.brandSlug },
      },
      include: { brand: true },
    });

    const estimate = await this.estimate({ deviceModelId: model.id, condition: params.condition });
    return { ...estimate, modelName: model.name, brandName: model.brand.name };
  }

  // Fraud detection: flag if too high a price is claimed
  computeFraudScore(params: {
    claimedCondition: Condition;
    claimedAge: number;
    imei?: string;
  }): number {
    let score = 0;
    if (params.claimedCondition === "A" && params.claimedAge > 3) score += 0.3;
    if (params.claimedAge < 0 || params.claimedAge > 10) score += 0.4;
    return Math.min(score, 1);
  }
}
