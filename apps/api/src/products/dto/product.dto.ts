import {
  IsString, IsEnum, IsNumber, IsOptional, IsArray,
  IsBoolean, Min, IsInt
} from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { Condition, ListingStatus } from "@dabacash/database";

export class CreateListingDto {
  @ApiProperty()
  @IsString()
  deviceModelId: string;

  @ApiProperty({ enum: Condition })
  @IsEnum(Condition)
  condition: Condition;

  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  buybackPrice: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  listingPrice: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  originalPrice?: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  stockQuantity: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  images: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  specs?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isNegotiable?: boolean;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  warrantyMonths?: number;
}

export class UpdateListingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  listingPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  stockQuantity?: number;

  @ApiProperty({ required: false, enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
