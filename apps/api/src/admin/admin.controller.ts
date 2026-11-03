import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Matches } from "class-validator";
import { AnalyticsService } from "../analytics/analytics.service";
import { AdminOnly } from "../common/decorators/admin-only.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PaginationQueryDto } from "../common/pagination";
import { AdminOrderQueryDto } from "../orders/dto/order.dto";
import { OrdersService } from "../orders/orders.service";
import { AdminCatalogService } from "./admin-catalog.service";
import { AdminFraudService } from "./admin-fraud.service";
import { AdminUsersService } from "./admin-users.service";
import { AdminService } from "./admin.service";
import {
  AnalyticsQueryDto, AuditQueryDto, BlockImeiDto, CatalogQueryDto, CreateFranchiseDto, CreateModelDto, FranchisesQueryDto,
  FraudListQueryDto, PaymentsQueryDto, ReopenFraudDto, ResolveFraudDto, UpdateFranchiseDto, UpdateModelDto, UpdateUserDto, UsersQueryDto,
} from "./dto/admin.dto";

type Me = { id: string };
class ImeiParam {
  @Matches(/^\d{15}$/, { message: "L'IMEI doit comporter 15 chiffres" })
  imei: string;
}

@ApiTags("admin")
@AdminOnly()
@Controller({ path: "admin", version: "1" })
export class AdminController {
  constructor(
    private admin: AdminService,
    private users: AdminUsersService,
    private fraud: AdminFraudService,
    private catalog: AdminCatalogService,
    private analytics: AnalyticsService,
    private orders: OrdersService
  ) {}

  // ─── overview ──────────────────────────────────────────────────────────────
  @Get("stats") @ApiOperation({ summary: "Platform KPIs (real counts)" })
  stats() { return this.admin.getPlatformStats(); }

  @Get("analytics") @ApiOperation({ summary: "Sales analytics over the last N days (7-365, default 30)" })
  getAnalytics(@Query() q: AnalyticsQueryDto) { return this.analytics.getAnalytics(q.days ?? 30); }

  // ─── users & roles ─────────────────────────────────────────────────────────
  @Get("users") listUsers(@Query() q: UsersQueryDto) { return this.users.list(q); }

  @Patch("users/:id") @ApiOperation({ summary: "Change a user's role or active status" })
  updateUser(@Param("id") id: string, @CurrentUser() me: Me, @Body() dto: UpdateUserDto) { return this.users.update(me.id, id, dto); }

  @Post("users/:id/unlock") @HttpCode(HttpStatus.NO_CONTENT) @ApiOperation({ summary: "Lift a login lockout" })
  async unlock(@Param("id") id: string, @CurrentUser() me: Me) { await this.users.unlock(me.id, id); }

  // ─── franchises ────────────────────────────────────────────────────────────
  @Get("franchises") listFranchises(@Query() q: FranchisesQueryDto) { return this.admin.listFranchises(q); }

  @Post("franchises") @ApiOperation({ summary: "Create a franchise together with its owner account" })
  createFranchise(@CurrentUser() me: Me, @Body() dto: CreateFranchiseDto) { return this.admin.createFranchise(me, dto); }

  @Patch("franchises/:id") @ApiOperation({ summary: "Update status, commission rate or contact details" })
  updateFranchise(@Param("id") id: string, @CurrentUser() me: Me, @Body() dto: UpdateFranchiseDto) { return this.admin.updateFranchise(me, id, dto); }

  // ─── orders & transactions ────────────────────────────────────────────────
  @Get("orders") listOrders(@Query() q: AdminOrderQueryDto) { return this.orders.findAll(q); }
  @Get("payments") @ApiOperation({ summary: "Transactions, filterable and paginated" })
  listPayments(@Query() q: PaymentsQueryDto) { return this.admin.listPayments(q); }

  // ─── fraud & IMEI ──────────────────────────────────────────────────────────
  @Get("fraud/flagged") flagged(@Query() q: FraudListQueryDto) { return this.fraud.listFlagged(q); }

  @Patch("fraud/:id/resolve") @ApiOperation({ summary: "Clear a flag, or confirm the fraud (cancels the request; note required)" })
  resolve(@Param("id") id: string, @CurrentUser() me: Me, @Body() dto: ResolveFraudDto) { return this.fraud.resolve(id, me, dto); }

  @Post("fraud/:id/reopen") @HttpCode(HttpStatus.OK) @ApiOperation({ summary: "Reopen a resolved flag with a stated reason" })
  reopen(@Param("id") id: string, @CurrentUser() me: Me, @Body() dto: ReopenFraudDto) { return this.fraud.reopen(id, me, dto); }

  @Get("imei/blocklist") blocklist(@Query() q: PaginationQueryDto) { return this.fraud.listBlocked(q.page, q.limit); }
  @Post("imei/blocklist") block(@CurrentUser() me: Me, @Body() dto: BlockImeiDto) { return this.fraud.block(me, dto); }

  @Delete("imei/blocklist/:imei") @HttpCode(HttpStatus.NO_CONTENT)
  async unblock(@Param() p: ImeiParam, @CurrentUser() me: Me) { await this.fraud.unblock(me, p.imei); }

  @Get("imei/:imei") @ApiOperation({ summary: "Blocklist entry and every request carrying this IMEI" })
  lookup(@Param() p: ImeiParam) { return this.fraud.lookupImei(p.imei); }

  // ─── catalog & pricing ─────────────────────────────────────────────────────
  @Get("catalog/models") listModels(@Query() q: CatalogQueryDto) { return this.catalog.listModels(q); }
  @Post("catalog/models") createModel(@CurrentUser() me: Me, @Body() dto: CreateModelDto) { return this.catalog.createModel(me, dto); }

  @Patch("catalog/models/:id") @ApiOperation({ summary: "Set the market baseline that drives buyback offers (audited)" })
  updateModel(@Param("id") id: string, @CurrentUser() me: Me, @Body() dto: UpdateModelDto) { return this.catalog.updateModel(me, id, dto); }

  // ─── audit trail ───────────────────────────────────────────────────────────
  @Get("audit") @ApiOperation({ summary: "Append-only audit trail, filterable and paginated" })
  audit(@Query() q: AuditQueryDto) { return this.admin.listAudit(q); }
}
