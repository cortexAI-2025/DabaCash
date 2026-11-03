import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../common/prisma/prisma.service";

@ApiTags("health")
@SkipThrottle()
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Liveness + database readiness (for load balancers and deploy checks)" })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: "error", database: "down" });
    }
    return { status: "ok", database: "up", uptimeSeconds: Math.round(process.uptime()), version: process.env.APP_VERSION ?? "dev" };
  }
}
