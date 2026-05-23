import {
  Controller, Get, Post, Patch, Param, Body,
  UseGuards, Request
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { BuybackService } from "./buyback.service";
import { CreateBuybackDto, ReviewBuybackDto } from "./dto/buyback.dto";
import { Role } from "@dabacash/database";

@ApiTags("buyback")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: "buyback", version: "1" })
export class BuybackController {
  constructor(private buyback: BuybackService) {}

  @Post()
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Submit a buyback request" })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateBuybackDto
  ) {
    return this.buyback.create(user.id, dto);
  }

  @Get("my")
  @Roles(Role.CUSTOMER)
  @ApiOperation({ summary: "Get all my buyback requests" })
  myRequests(@CurrentUser() user: { id: string }) {
    return this.buyback.findAllForCustomer(user.id);
  }

  @Get("franchise")
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Get all buyback requests for my franchise" })
  franchiseRequests(@CurrentUser() user: { id: string }) {
    return this.buyback.findAllForFranchise(user.id);
  }

  @Patch(":id/review")
  @Roles(Role.FRANCHISE_OWNER)
  @ApiOperation({ summary: "Accept or reject a buyback request" })
  review(
    @Param("id") id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: ReviewBuybackDto
  ) {
    return this.buyback.review(id, user.id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get buyback request details" })
  findOne(@Param("id") id: string) {
    return this.buyback.findById(id);
  }
}
