import { applyDecorators, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { Role } from "@dabacash/database";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { Roles } from "./roles.decorator";

/** Authenticated ADMIN only. Applied at class level so a new route cannot be forgotten. */
export const AdminOnly = () => applyDecorators(ApiBearerAuth(), UseGuards(JwtAuthGuard, RolesGuard), Roles(Role.ADMIN));
