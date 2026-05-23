import { Controller, Get, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminService } from "./admin.service";
import { Role } from "@dabacash/database";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller({ path: "admin", version: "1" })
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get("stats")
  @ApiOperation({ summary: "Platform-wide statistics" })
  getStats() {
    return this.admin.getPlatformStats();
  }

  @Get("franchises")
  @ApiOperation({ summary: "All franchises with details" })
  getFranchises() {
    return this.admin.getFranchises();
  }

  @Patch("franchises/:id")
  @ApiOperation({ summary: "Update franchise status or commission" })
  updateFranchise(
    @Param("id") id: string,
    @Body() data: { status?: string; commissionRate?: number }
  ) {
    return this.admin.updateFranchise(id, data);
  }

  @Get("fraud/flagged")
  @ApiOperation({ summary: "Get flagged buyback requests" })
  getFlagged() {
    return this.admin.getFlaggedBuybacks();
  }

  @Get("orders")
  @ApiOperation({ summary: "All platform orders" })
  getAllOrders() {
    return this.admin.getAllOrders();
  }
}
