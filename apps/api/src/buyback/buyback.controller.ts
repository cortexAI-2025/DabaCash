import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Role } from "@dabacash/database";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { BuybackService } from "./buyback.service";
import { BuybackListQueryDto, CreateBuybackDto, ReviewBuybackDto } from "./dto/buyback.dto";

type Me = { id: string; role: Role };
const KEY = /^[A-Za-z0-9_-]{8,100}$/;

@ApiTags("buyback")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: "buyback", version: "1" })
export class BuybackController {
  constructor(private buyback: BuybackService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiHeader({ name: "Idempotency-Key", required: false, description: "Retrying with the same key returns the original request" })
  @ApiOperation({ summary: "Submit a buyback request" })
  create(@CurrentUser() user: Me, @Body() dto: CreateBuybackDto, @Headers("idempotency-key") key?: string) {
    if (key !== undefined && !KEY.test(key)) throw new BadRequestException("Idempotency-Key invalide (8 à 100 caractères alphanumériques, - ou _)");
    return this.buyback.create(user.id, dto, key);
  }

  @Get("my")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "My buyback requests (paginated)" })
  myRequests(@CurrentUser() user: Me, @Query() q: BuybackListQueryDto) {
    return this.buyback.findAllForCustomer(user.id, q);
  }

  @Get("franchise")
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Buyback requests assigned to my franchise (paginated)" })
  franchiseRequests(@CurrentUser() user: Me, @Query() q: BuybackListQueryDto) {
    return this.buyback.findAllForFranchise(user.id, q);
  }

  @Patch(":id/review")
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Accept or reject a buyback request (blocked while under fraud review)" })
  review(@Param("id") id: string, @CurrentUser() user: Me, @Body() dto: ReviewBuybackDto) {
    return this.buyback.review(id, user.id, dto);
  }

  @Post(":id/complete")
  @Roles(Role.FRANCHISE_OWNER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark an accepted request as completed (device received, customer paid)" })
  complete(@Param("id") id: string, @CurrentUser() user: Me) {
    return this.buyback.complete(id, user.id);
  }

  @Post(":id/cancel")
  @Roles(Role.CUSTOMER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Withdraw my request before the franchise takes the device" })
  cancel(@Param("id") id: string, @CurrentUser() user: Me) {
    return this.buyback.cancel(id, user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Request details: customer, assigned franchise or admin only" })
  findOne(@Param("id") id: string, @CurrentUser() user: Me) {
    return this.buyback.findById(id, user);
  }
}
