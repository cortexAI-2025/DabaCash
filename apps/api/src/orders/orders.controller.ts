import {
  Controller, Get, Post, Patch, Param, Body, UseGuards
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OrdersService } from "./orders.service";
import { CreateOrderDto, UpdateOrderStatusDto } from "./dto/order.dto";
import { Role, OrderStatus } from "@dabacash/database";

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: "orders", version: "1" })
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Place a new order" })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateOrderDto) {
    return this.orders.create(user.id, dto);
  }

  @Get("my")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Get my orders" })
  myOrders(@CurrentUser() user: { id: string }) {
    return this.orders.findByCustomer(user.id);
  }

  @Get("franchise")
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Get all orders for my franchise" })
  franchiseOrders(@CurrentUser() user: { id: string }) {
    return this.orders.findByFranchise(user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order details" })
  findOne(@Param("id") id: string) {
    return this.orders.findById(id);
  }

  @Patch(":id/status")
  @Roles(Role.FRANCHISE_OWNER, Role.ADMIN)
  @ApiOperation({ summary: "Update order status" })
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto.status as OrderStatus);
  }
}
