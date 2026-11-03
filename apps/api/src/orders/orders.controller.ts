import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards, Headers } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@dabacash/database";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { CreateOrderDto, OrderListQueryDto, UpdateOrderStatusDto } from "./dto/order.dto";
import { OrdersService } from "./orders.service";

type Me = { id: string; role: Role };
const KEY = /^[A-Za-z0-9_-]{8,100}$/;

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: "orders", version: "1" })
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Retrying with the same key returns the original order" })
  @ApiOperation({ summary: "Place a new order" })
  create(@CurrentUser() user: Me, @Body() dto: CreateOrderDto, @Headers("idempotency-key") key?: string) {
    if (key !== undefined && !KEY.test(key)) throw new BadRequestException("Idempotency-Key invalide (8 à 100 caractères alphanumériques, - ou _)");
    return this.orders.create(user.id, dto, key);
  }

  @Get("my")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "My orders (paginated)" })
  myOrders(@CurrentUser() user: Me, @Query() q: OrderListQueryDto) {
    return this.orders.findByCustomer(user.id, q);
  }

  @Get("franchise")
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Orders of my franchise (paginated, filter by status)" })
  franchiseOrders(@CurrentUser() user: Me, @Query() q: OrderListQueryDto) {
    return this.orders.findByFranchise(user.id, q);
  }

  @Get(":id")
  @ApiOperation({ summary: "Order details: customer, fulfilling franchise or admin only" })
  findOne(@Param("id") id: string, @CurrentUser() user: Me) {
    return this.orders.findById(id, user);
  }

  @Post(":id/cancel")
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel my own unpaid, pending order" })
  cancel(@Param("id") id: string, @CurrentUser() user: Me) {
    return this.orders.updateStatus(id, "CANCELLED", user);
  }

  @Patch(":id/status")
  @Roles(Role.FRANCHISE_OWNER, Role.ADMIN)
  @ApiOperation({ summary: "Update order status (franchise: own orders only)" })
  updateStatus(@Param("id") id: string, @CurrentUser() user: Me, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto.status, user);
  }
}
