import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { FranchisesService } from "./franchises.service";
import { Role } from "@dabacash/database";

@ApiTags("franchises")
@Controller({ path: "franchises", version: "1" })
export class FranchisesController {
  constructor(private franchises: FranchisesService) {}

  @Get()
  @ApiOperation({ summary: "List all active franchises (public)" })
  findAll() {
    return this.franchises.findAll();
  }

  @Get("dashboard")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Get franchise dashboard stats" })
  getDashboard(@CurrentUser() user: { id: string }) {
    return this.franchises.getDashboardStats(user.id);
  }

  @Get("dashboard/recent-sales")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Recent sales for franchise dashboard" })
  getRecentSales(@CurrentUser() user: { id: string }) {
    return this.franchises.getRecentSales(user.id);
  }

  @Get(":slug")
  @ApiOperation({ summary: "Get franchise by slug (public)" })
  findOne(@Param("slug") slug: string) {
    return this.franchises.findBySlug(slug);
  }
}
