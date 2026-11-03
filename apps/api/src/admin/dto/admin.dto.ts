import { Transform, Type } from "class-transformer";
import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DeviceType, FranchiseStatus, FraudResolution, PaymentMethod, PaymentStatus, Role } from "@dabacash/database";
import { PASSWORD_MESSAGE, PASSWORD_RULE } from "../../auth/dto/auth.dto";
import { PaginationQueryDto } from "../../common/pagination";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── analytics ───────────────────────────────────────────────────────────────
export class AnalyticsQueryDto {
  @ApiPropertyOptional({ default: 30, minimum: 7, maximum: 365 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(365)
  days?: number;
}

// ─── fraud ───────────────────────────────────────────────────────────────────
export class ResolveFraudDto {
  @ApiProperty({ enum: FraudResolution }) @IsEnum(FraudResolution) resolution: FraudResolution;

  @ApiPropertyOptional({ description: "Required when confirming fraud" })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ description: "When confirming fraud: also add the IMEI to the blocklist" })
  @IsOptional() @IsBoolean()
  blockImei?: boolean;
}

export class ReopenFraudDto {
  @ApiProperty({ description: "Why the decision is being reopened" })
  @Transform(trim) @IsString() @Length(5, 500)
  note: string;
}

export class FraudListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ["open", "resolved", "all"], default: "open" })
  @IsOptional() @IsIn(["open", "resolved", "all"])
  status: "open" | "resolved" | "all" = "open";
}

// ─── IMEI ────────────────────────────────────────────────────────────────────
export class BlockImeiDto {
  @ApiProperty() @Transform(trim) @Matches(/^\d{15}$/, { message: "L'IMEI doit comporter 15 chiffres" }) imei: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 300) reason: string;
}

// ─── users ───────────────────────────────────────────────────────────────────
export class UsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional({ enum: ["active", "inactive", "locked", "deleted"] })
  @IsOptional() @IsIn(["active", "inactive", "locked", "deleted"])
  status?: "active" | "inactive" | "locked" | "deleted";
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: Role }) @IsOptional() @IsEnum(Role) role?: Role;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

// ─── franchises ──────────────────────────────────────────────────────────────
export class FranchiseOwnerDto {
  @ApiProperty() @Transform(lower) @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 60) firstName: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(1, 60) lastName: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @Matches(/^\+?[0-9 ]{8,16}$/) phone?: string;
  @ApiProperty({ description: `Initial password, to be changed by the owner. ${PASSWORD_MESSAGE}` })
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;
}

export class CreateFranchiseDto {
  @ApiProperty() @Transform(trim) @IsString() @Length(3, 80) name: string;
  @ApiProperty({ description: "City slug, see GET /cities" }) @Matches(SLUG) citySlug: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(5, 200) address: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[0-9 ]{8,16}$/) phoneNumber?: string;
  @ApiPropertyOptional({ default: 0.15, minimum: 0, maximum: 0.5 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(0.5) commissionRate?: number;
  @ApiProperty({ type: FranchiseOwnerDto }) @ValidateNested() @Type(() => FranchiseOwnerDto) owner: FranchiseOwnerDto;
}

export class UpdateFranchiseDto {
  @ApiPropertyOptional({ enum: FranchiseStatus }) @IsOptional() @IsEnum(FranchiseStatus) status?: FranchiseStatus;
  @ApiPropertyOptional({ minimum: 0, maximum: 0.5 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(0.5) commissionRate?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(3, 80) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @Length(5, 200) address?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[0-9 ]{8,16}$/) phoneNumber?: string;
}

export class FranchisesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: FranchiseStatus }) @IsOptional() @IsEnum(FranchiseStatus) status?: FranchiseStatus;
}

// ─── payments & audit ────────────────────────────────────────────────────────
export class PaymentsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus }) @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @ApiPropertyOptional({ description: "Customer email, order id suffix or gateway reference" })
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100)
  search?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z_]{3,60}$/) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) actorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

// ─── catalog ─────────────────────────────────────────────────────────────────
export class CatalogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ enum: DeviceType }) @IsOptional() @IsEnum(DeviceType) deviceType?: DeviceType;
}

export class CreateModelDto {
  @ApiProperty({ description: "Brand name; created if it does not exist" }) @Transform(trim) @IsString() @Length(2, 60) brandName: string;
  @ApiProperty() @Transform(trim) @IsString() @Length(2, 80) name: string;
  @ApiProperty({ enum: DeviceType }) @IsEnum(DeviceType) deviceType: DeviceType;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2000) @Max(2100) releaseYear?: number;
  @ApiProperty({ description: "Current market price, whole MAD. Drives every buyback offer." })
  @IsInt() @Min(100) @Max(10_000_000) baseMarketPrice: number;
}

export class UpdateModelDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(100) @Max(10_000_000) baseMarketPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(2000) @Max(2100) releaseYear?: number;
}
