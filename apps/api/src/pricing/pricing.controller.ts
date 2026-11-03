import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { IsEnum, Matches } from "class-validator";
import { Condition } from "@dabacash/database";
import { PricingService } from "./pricing.service";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class EstimateQueryDto {
  @Matches(SLUG, { message: "brandSlug invalide" })
  brandSlug: string;

  @Matches(SLUG, { message: "modelSlug invalide" })
  modelSlug: string;

  @IsEnum(Condition)
  condition: Condition;
}

@ApiTags("pricing")
@Controller({ path: "pricing", version: "1" })
export class PricingController {
  constructor(private pricingService: PricingService) {}

  @Get("estimate")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Indicative buyback + resale estimate (public, read-only)" })
  estimate(@Query() q: EstimateQueryDto) {
    return this.pricingService.estimateByModelSlug(q);
  }
}
