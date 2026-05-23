import {
  Controller, Get, Param, Query, ParseIntPipe,
  ParseEnumPipe, DefaultValuePipe, Optional
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { Condition, DeviceType } from "@dabacash/database";
import { MarketplaceService } from "./marketplace.service";

@ApiTags("marketplace")
@Controller({ path: "marketplace", version: "1" })
export class MarketplaceController {
  constructor(private marketplace: MarketplaceService) {}

  @Get("listings")
  @ApiOperation({ summary: "Browse marketplace listings with filters" })
  getListings(
    @Query("search") search?: string,
    @Query("brand") brand?: string,
    @Query("deviceType") deviceType?: DeviceType,
    @Query("condition") condition?: Condition,
    @Query("minPrice") minPrice?: number,
    @Query("maxPrice") maxPrice?: number,
    @Query("city") city?: string,
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query("sortBy") sortBy?: "price_asc" | "price_desc" | "newest" | "popular"
  ) {
    return this.marketplace.getListings({
      search, brand, deviceType, condition, minPrice, maxPrice,
      city, page, limit, sortBy
    });
  }

  @Get("listings/featured")
  @ApiOperation({ summary: "Get featured listings for homepage" })
  getFeatured() {
    return this.marketplace.getFeaturedListings();
  }

  @Get("listings/:id")
  @ApiOperation({ summary: "Get single listing details" })
  getListing(@Param("id") id: string) {
    return this.marketplace.getListingById(id);
  }

  @Get("brands")
  @ApiOperation({ summary: "List all active brands" })
  getBrands() {
    return this.marketplace.getBrands();
  }

  @Get("models")
  @ApiOperation({ summary: "List device models, optionally filtered by brand" })
  getModels(@Query("brand") brandSlug?: string) {
    return this.marketplace.getDeviceModels(brandSlug);
  }
}
