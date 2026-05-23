import {
  IsString, IsEnum, IsOptional, IsArray,
  IsDateString, IsNumber, Min
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Condition, DeliveryMethod } from "@dabacash/database";

export class CreateBuybackDto {
  @ApiProperty()
  @IsString()
  deviceModelId: string;

  @ApiProperty({ enum: Condition })
  @IsEnum(Condition)
  condition: Condition;

  @ApiProperty({ enum: DeliveryMethod })
  @IsEnum(DeliveryMethod)
  deliveryMethod: DeliveryMethod;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  images?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pickupAddress?: string;
}

export class ReviewBuybackDto {
  @ApiProperty({ enum: ["ACCEPTED", "REJECTED"] })
  @IsEnum(["ACCEPTED", "REJECTED"])
  decision: "ACCEPTED" | "REJECTED";

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  finalBuybackPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  franchiseNotes?: string;
}
