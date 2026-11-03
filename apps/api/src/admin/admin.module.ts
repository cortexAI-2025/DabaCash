import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AuthModule } from "../auth/auth.module";
import { OrdersModule } from "../orders/orders.module";
import { AdminCatalogService } from "./admin-catalog.service";
import { AdminFraudService } from "./admin-fraud.service";
import { AdminUsersService } from "./admin-users.service";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AnalyticsModule, AuthModule, OrdersModule],
  controllers: [AdminController],
  providers: [AdminService, AdminUsersService, AdminFraudService, AdminCatalogService],
})
export class AdminModule {}
