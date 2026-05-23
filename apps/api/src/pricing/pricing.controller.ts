import { Controller, Get, Query, ParseEnumPipe } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { Condition } from "@dabacash/database";
import { PricingService } from "./pricing.service";

@ApiTags("pricing")
@Controller({ path: "pricing", version: "1" })
export class PricingController {
  constructor(private pricingService: PricingService) {}

  @Get("estimate")
  @ApiOperation({ summary: "Get AI buyback + resale price estimate" })
  @ApiQuery({ name: "brandSlug", example: "apple" })
  @ApiQuery({ name: "modelSlug", example: "iphone-14" })
  @ApiQuery({ name: "condition", enum: Condition })
  estimate(
    @Query("brandSlug") brandSlug: string,
    @Query("modelSlug") modelSlug: string,
    @Query("condition", new ParseEnumPipe(Condition)) condition: Condition
  ) {
    return this.pricingService.estimateByModelSlug({ brandSlug, modelSlug, condition });
  }
}
