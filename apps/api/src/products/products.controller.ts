import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ProductsService } from "./products.service";
import { CreateListingDto, UpdateListingDto } from "./dto/product.dto";
import { Role } from "@dabacash/database";

@ApiTags("products")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FRANCHISE_OWNER, Role.ADMIN)
@Controller({ path: "products", version: "1" })
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Post()
  @ApiOperation({ summary: "Create a new product listing" })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateListingDto) {
    return this.products.create(user.id, dto);
  }

  @Get("my")
  @ApiOperation({ summary: "Get all listings for my franchise" })
  myListings(@CurrentUser() user: { id: string }) {
    return this.products.findByFranchise(user.id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a listing" })
  update(
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateListingDto
  ) {
    return this.products.update(id, user.id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Archive a listing" })
  remove(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.products.remove(id, user.id);
  }
}
