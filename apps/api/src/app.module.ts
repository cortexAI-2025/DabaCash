import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
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
import { PrismaModule } from "./common/prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
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
  ],
})
export class AppModule {}
