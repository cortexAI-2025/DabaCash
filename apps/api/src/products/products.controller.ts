import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@dabacash/database";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateListingDto, ListingListQueryDto, UpdateListingDto } from "./dto/product.dto";
import { ProductsService } from "./products.service";

type Me = { id: string };

// Franchise owners only: admins have no franchise, so these routes have no meaning for them.
@ApiTags("products")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FRANCHISE_OWNER)
@Controller({ path: "products", version: "1" })
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Post()
  @ApiOperation({ summary: "Publish a listing in my franchise" })
  create(@CurrentUser() user: Me, @Body() dto: CreateListingDto) {
    return this.products.create(user.id, dto);
  }

  @Get("my")
  @ApiOperation({ summary: "My franchise's listings (paginated)" })
  myListings(@CurrentUser() user: Me, @Query() q: ListingListQueryDto) {
    return this.products.findByFranchise(user.id, q);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update price, stock, status or description of my listing" })
  update(@Param("id") id: string, @CurrentUser() user: Me, @Body() dto: UpdateListingDto) {
    return this.products.update(id, user.id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Archive my listing" })
  remove(@Param("id") id: string, @CurrentUser() user: Me) {
    return this.products.remove(id, user.id);
  }
}
