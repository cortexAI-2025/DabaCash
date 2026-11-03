import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { PaginationQueryDto } from "../common/pagination";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { InventoryService } from "./inventory.service";
import { Role } from "@dabacash/database";

@ApiTags("inventory")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.FRANCHISE_OWNER)
@Controller({ path: "inventory", version: "1" })
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get()
  @ApiOperation({ summary: "Get full inventory for my franchise" })
  getInventory(@CurrentUser() user: { id: string }, @Query() q: PaginationQueryDto) {
    return this.inventory.getForFranchise(user.id, q);
  }

  @Get("summary")
  @ApiOperation({ summary: "Get stock summary counts" })
  getSummary(@CurrentUser() user: { id: string }) {
    return this.inventory.getStockSummary(user.id);
  }
}
