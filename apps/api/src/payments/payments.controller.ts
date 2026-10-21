import {
  Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post,
  RawBodyRequest, Req, UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { Role } from "@dabacash/database";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AslanClient } from "./aslan.client";
import { PaymentsService } from "./payments.service";
import { StartCheckoutDto } from "./dto/payments.dto";

@ApiTags("payments")
@Controller({ path: "payments", version: "1" })
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private aslan: AslanClient
  ) {}

  @Post("aslan/checkout")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start an Aslan hosted checkout for an order; returns the URL to redirect to" })
  checkout(@CurrentUser() user: { id: string }, @Body() dto: StartCheckoutDto) {
    return this.payments.startAslanCheckout(user.id, dto.orderId);
  }

  @Get("order/:orderId")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "Payment status of an order (owner or admin)" })
  status(@CurrentUser() user: { id: string; role: Role }, @Param("orderId") orderId: string) {
    return this.payments.getOrderPaymentStatus(user, orderId);
  }

  @Post("aslan/webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Aslan webhook receiver (HMAC-signed, public)" })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("x-webhook-signature") signature?: string
  ) {
    const event = this.aslan.verifyWebhook(req.rawBody, signature);
    await this.payments.handleAslanEvent(event);
    return { received: true };
  }
}
