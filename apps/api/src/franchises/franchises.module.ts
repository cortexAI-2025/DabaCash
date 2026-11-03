import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { FranchisesController } from "./franchises.controller";
import { FranchisesService } from "./franchises.service";

@Module({
  imports: [AnalyticsModule],
  controllers: [FranchisesController],
  providers: [FranchisesService],
  exports: [FranchisesService],
})
export class FranchisesModule {}
