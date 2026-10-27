import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { FraudResolution } from "@dabacash/database";

export class ResolveFraudDto {
  @ApiProperty({ enum: FraudResolution })
  @IsEnum(FraudResolution)
  resolution: FraudResolution;

  @ApiProperty({ required: false, description: "Required when confirming fraud" })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AnalyticsQueryDto {
  @ApiProperty({ required: false, default: 30, minimum: 7, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  days?: number;
}
