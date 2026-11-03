import { Transform, Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Condition, DeviceType } from "@dabacash/database";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class ListingsQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) brand?: string;
  @ApiPropertyOptional({ enum: DeviceType }) @IsOptional() @IsEnum(DeviceType) deviceType?: DeviceType;
  @ApiPropertyOptional({ enum: Condition }) @IsOptional() @IsEnum(Condition) condition?: Condition;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000_000) maxPrice?: number;
  @ApiPropertyOptional({ description: "City slug" }) @IsOptional() @Matches(SLUG) city?: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000) page: number = 1;
  @ApiPropertyOptional({ default: 20, maximum: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 20;
  @ApiPropertyOptional({ enum: ["newest", "price_asc", "price_desc", "popular"] })
  @IsOptional()
  @IsIn(["newest", "price_asc", "price_desc", "popular"])
  sortBy: "newest" | "price_asc" | "price_desc" | "popular" = "newest";
}

export class ModelsQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG) brand?: string;
}
