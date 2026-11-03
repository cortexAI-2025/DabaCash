import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { FranchisesModule } from "./franchises/franchises.module";
import { ProductsModule } from "./products/products.module";
import { BuybackModule } from "./buyback/buyback.module";
import { OrdersModule } from "./orders/orders.module";
import { MarketplaceModule } from "./marketplace/marketplace.module";
import { PricingModule } from "./pricing/pricing.module";
import { InventoryModule } from "./inventory/inventory.module";
import { AdminModule } from "./admin/admin.module";
import { CitiesModule } from "./cities/cities.module";
import { PaymentsModule } from "./payments/payments.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AuditModule } from "./audit/audit.module";
import { HealthModule } from "./health/health.module";
import { validateEnv } from "./config/env.validation";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60_000, limit: Number(config.get("THROTTLE_LIMIT") ?? 120) }],
        skipIf: () => config.get("THROTTLE_DISABLED") === "true", // integration tests only; refused in production
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    HealthModule,
    AuthModule,
    UsersModule,
    FranchisesModule,
    ProductsModule,
    BuybackModule,
    OrdersModule,
    MarketplaceModule,
    PricingModule,
    InventoryModule,
    AdminModule,
    CitiesModule,
    PaymentsModule,
    RealtimeModule,
    NotificationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
