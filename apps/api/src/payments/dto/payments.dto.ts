import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class StartCheckoutDto {
  @ApiProperty()
  @IsString()
  orderId: string;
}
