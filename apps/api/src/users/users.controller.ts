import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { Role } from "@dabacash/database";
import { AuthService } from "../auth/auth.service";
import { ChangePasswordDto } from "../auth/dto/auth.dto";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PaginationQueryDto } from "../common/pagination";
import { DeleteAccountDto, UpdateProfileDto } from "./dto/users.dto";
import { UsersService } from "./users.service";

type Me = { id: string; role: Role };

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "users", version: "1" })
export class UsersController {
  constructor(
    private users: UsersService,
    private auth: AuthService
  ) {}

  @Get("me")
  @ApiOperation({ summary: "Current user profile" })
  getProfile(@CurrentUser() me: Me) {
    return this.users.getProfile(me.id);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update own profile (name, phone, avatar only)" })
  updateProfile(@CurrentUser() me: Me, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(me.id, me.role, dto);
  }

  @Patch("me/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: "Change password; signs every device out" })
  async changePassword(@CurrentUser() me: Me, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    await this.auth.changePassword(me.id, me.role, dto, { ip: req.ip, userAgent: req.headers["user-agent"] });
  }

  @Get("me/export")
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: "Export all personal data held about me (JSON)" })
  exportData(@CurrentUser() me: Me) {
    return this.users.exportData(me.id, me.role);
  }

  @Delete("me")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({ summary: "Delete my account (anonymisation); requires my password" })
  async deleteAccount(@CurrentUser() me: Me, @Body() dto: DeleteAccountDto) {
    await this.users.deleteAccount(me.id, me.role, dto.password);
  }

  @Get("me/notifications")
  @ApiOperation({ summary: "My notifications (paginated) + unread count" })
  notifications(@CurrentUser() me: Me, @Query() q: PaginationQueryDto) {
    return this.users.listNotifications(me.id, q);
  }

  @Post("me/notifications/read-all")
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() me: Me) {
    return this.users.markAllNotificationsRead(me.id);
  }

  @Patch("me/notifications/:id/read")
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@Param("id") id: string, @CurrentUser() me: Me) {
    await this.users.markNotificationRead(id, me.id);
  }
}
