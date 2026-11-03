import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUrl, Length, Matches } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

/** The only fields a user may change on their own profile. Role, email and status are not among them. */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9 ]{8,16}$/, { message: "Numéro de téléphone invalide" })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ["https"], require_protocol: true })
  @Length(1, 500)
  avatarUrl?: string;
}

export class DeleteAccountDto {
  @ApiPropertyOptional({ description: "Current password, required to confirm" })
  @IsString()
  @Length(1, 72)
  password: string;
}
