import { Module } from "@nestjs/common";
import { AslanClient } from "./aslan.client";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, AslanClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
