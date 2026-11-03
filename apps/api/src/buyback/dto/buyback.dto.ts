import { Transform } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Matches, Max, MaxLength, Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BuybackStatus, Condition, DeliveryMethod } from "@dabacash/database";
import { PaginationQueryDto } from "../../common/pagination";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export const BUYBACK_DELIVERY_METHODS = [DeliveryMethod.DROP_IN_STORE, DeliveryMethod.PICKUP_FROM_HOME] as const;

export class CreateBuybackDto {
  @ApiProperty()
  @IsString()
  @Length(1, 50)
  deviceModelId: string;

  @ApiProperty({ example: "casablanca", description: "City slug, see GET /cities" })
  @IsString()
  @Matches(/^[a-z0-9-]{2,40}$/)
  citySlug: string;

  @ApiProperty({ enum: Condition })
  @IsEnum(Condition)
  condition: Condition;

  @ApiProperty({ enum: BUYBACK_DELIVERY_METHODS })
  @IsIn(BUYBACK_DELIVERY_METHODS)
  deliveryMethod: DeliveryMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ type: [String], description: "HTTPS photo URLs (upload is not available yet)" })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ protocols: ["https"], require_protocol: true }, { each: true })
  @MaxLength(500, { each: true })
  images?: string[];

  @ApiPropertyOptional({ description: "15 digits. Dial *#06# on the device." })
  @IsOptional()
  @Transform(trim)
  @Matches(/^\d{15}$/, { message: "L'IMEI doit comporter 15 chiffres" })
  imei?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @ApiPropertyOptional({ description: "Required for PICKUP_FROM_HOME" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(5, 200)
  pickupAddress?: string;
}

export class ReviewBuybackDto {
  @ApiProperty({ enum: ["ACCEPTED", "REJECTED"] })
  @IsIn(["ACCEPTED", "REJECTED"])
  decision: "ACCEPTED" | "REJECTED";

  @ApiPropertyOptional({ description: "Whole MAD. Overriding the estimate by more than 50% requires a note." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  finalBuybackPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  franchiseNotes?: string;
}

export class BuybackListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BuybackStatus })
  @IsOptional()
  @IsEnum(BuybackStatus)
  status?: BuybackStatus;
}
