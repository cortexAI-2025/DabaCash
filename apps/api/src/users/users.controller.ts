import { Controller, Get, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UsersService } from "./users.service";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: "users", version: "1" })
export class UsersController {
  constructor(private users: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Get current user profile" })
  getProfile(@CurrentUser() user: { id: string }) {
    return this.users.getProfile(user.id);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update profile" })
  updateProfile(
    @CurrentUser() user: { id: string },
    @Body() data: { firstName?: string; lastName?: string; phone?: string; avatarUrl?: string }
  ) {
    return this.users.updateProfile(user.id, data);
  }

  @Get("me/notifications")
  @ApiOperation({ summary: "Get notifications" })
  getNotifications(@CurrentUser() user: { id: string }) {
    return this.users.getNotifications(user.id);
  }

  @Patch("me/notifications/:id/read")
  @ApiOperation({ summary: "Mark notification as read" })
  markRead(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.users.markNotificationRead(id, user.id);
  }
}
