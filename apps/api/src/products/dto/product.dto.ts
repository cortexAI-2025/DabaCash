import { Transform } from "class-transformer";
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, MaxLength, Min,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Condition, ListingStatus } from "@dabacash/database";
import { PaginationQueryDto } from "../../common/pagination";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

// Franchises may only move a listing between these states; SOLD/RESERVED are set by the system.
export const FRANCHISE_LISTING_STATUSES = [ListingStatus.ACTIVE, ListingStatus.DRAFT, ListingStatus.ARCHIVED] as const;

export class CreateListingDto {
  @ApiProperty() @IsString() @Length(1, 50) deviceModelId: string;
  @ApiProperty({ enum: Condition }) @IsEnum(Condition) condition: Condition;

  @ApiProperty() @Transform(trim) @IsString() @Length(5, 150) title: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?: string;

  // Whole dirhams: the payment provider (NAPS) rejects fractional amounts.
  @ApiProperty({ description: "MAD, whole number" }) @IsInt() @Min(0) @Max(10_000_000) buybackPrice: number;
  @ApiProperty({ description: "MAD, whole number, >= buybackPrice" }) @IsInt() @Min(1) @Max(10_000_000) listingPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_000_000) originalPrice?: number;

  @ApiProperty() @IsInt() @Min(0) @Max(1000) stockQuantity: number;

  @ApiProperty({ type: [String], description: "HTTPS image URLs (upload is not available yet)" })
  @IsArray()
  @ArrayMaxSize(8)
  @IsUrl({ protocols: ["https"], require_protocol: true }, { each: true })
  @MaxLength(500, { each: true })
  images: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isNegotiable?: boolean;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(36) warrantyMonths?: number;
}

export class UpdateListingDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(5, 150) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(10_000_000) listingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) stockQuantity?: number;
  @ApiPropertyOptional({ enum: FRANCHISE_LISTING_STATUSES }) @IsOptional() @IsIn(FRANCHISE_LISTING_STATUSES) status?: ListingStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(36) warrantyMonths?: number;
}

export class ListingListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ListingStatus }) @IsOptional() @IsEnum(ListingStatus) status?: ListingStatus;
}
