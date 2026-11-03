import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { ListingsQueryDto, ModelsQueryDto } from "./dto/marketplace.dto";
import { MarketplaceService } from "./marketplace.service";

@ApiTags("marketplace")
@Controller({ path: "marketplace", version: "1" })
export class MarketplaceController {
  constructor(private marketplace: MarketplaceService) {}

  @Get("listings")
  @ApiOperation({ summary: "Browse marketplace listings (page size capped at 50)" })
  getListings(@Query() q: ListingsQueryDto) {
    return this.marketplace.getListings(q);
  }

  @Get("listings/featured")
  @ApiOperation({ summary: "Most viewed listings for the homepage" })
  getFeatured() {
    return this.marketplace.getFeaturedListings();
  }

  @Get("listings/:id")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: "Listing details (only listings that are for sale or sold)" })
  getListing(@Param("id") id: string) {
    return this.marketplace.getListingById(id);
  }

  @Get("brands")
  getBrands() {
    return this.marketplace.getBrands();
  }

  @Get("models")
  @ApiOperation({ summary: "Device models that can be estimated, optionally by brand" })
  getModels(@Query() q: ModelsQueryDto) {
    return this.marketplace.getDeviceModels(q.brand);
  }

  @Get("stats")
  @ApiOperation({ summary: "Public platform figures (real counts)" })
  getStats() {
    return this.marketplace.getPublicStats();
  }
}
