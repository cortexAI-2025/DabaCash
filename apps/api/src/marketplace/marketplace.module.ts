import { Module } from "@nestjs/common";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";
import { MarketplaceGateway } from "./marketplace.gateway";

@Module({
  controllers: [MarketplaceController],
  providers: [MarketplaceService, MarketplaceGateway],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
