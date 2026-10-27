import { Controller, Get, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminService } from "./admin.service";
import { AnalyticsService } from "./analytics.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AnalyticsQueryDto, ResolveFraudDto } from "./dto/admin.dto";
import { FranchiseStatus, Role } from "@dabacash/database";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller({ path: "admin", version: "1" })
export class AdminController {
  constructor(
    private admin: AdminService,
    private analytics: AnalyticsService
  ) {}

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
    @Body() data: { status?: FranchiseStatus; commissionRate?: number }
  ) {
    return this.admin.updateFranchise(id, data);
  }

  @Get("fraud/flagged")
  @ApiOperation({ summary: "Flagged buyback requests (status: open | resolved | all)" })
  getFlagged(@Query("status") status?: string) {
    return this.admin.getFlaggedBuybacks(status === "resolved" || status === "all" ? status : "open");
  }

  @Patch("fraud/:id/resolve")
  @ApiOperation({ summary: "Clear a fraud flag or confirm the fraud (cancels the request)" })
  resolveFraud(
    @Param("id") id: string,
    @CurrentUser() admin: { id: string },
    @Body() dto: ResolveFraudDto
  ) {
    return this.admin.resolveFraud(id, admin.id, dto);
  }

  @Get("analytics")
  @ApiOperation({ summary: "Sales analytics over the last N days (7-365, default 30)" })
  getAnalytics(@Query() query: AnalyticsQueryDto) {
    return this.analytics.getAnalytics(query.days ?? 30);
  }

  @Get("orders")
  @ApiOperation({ summary: "All platform orders" })
  getAllOrders() {
    return this.admin.getAllOrders();
  }
}
