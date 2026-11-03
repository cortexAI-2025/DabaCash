import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

const normalize = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim().toLowerCase() : value);

// 10-72 chars (bcrypt ignores everything past 72 bytes), at least one letter and one digit.
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,72}$/;
export const PASSWORD_MESSAGE = "Le mot de passe doit contenir de 10 à 72 caractères dont au moins une lettre et un chiffre";

export class LoginDto {
  @ApiProperty({ example: "client@exemple.ma" })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @IsString()
  @Length(1, 72)
  password: string;
}

export class RegisterDto {
  @ApiProperty()
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty()
  @Transform(normalize)
  @IsString()
  @Length(1, 60)
  firstName: string;

  @ApiProperty()
  @Transform(normalize)
  @IsString()
  @Length(1, 60)
  lastName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Transform(normalize)
  @Matches(/^\+?[0-9 ]{8,16}$/, { message: "Numéro de téléphone invalide" })
  phone?: string;
  // No `role` field on purpose: self-registration always creates a CUSTOMER.
  // Franchise owners and admins are created by an admin.
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2048)
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @Length(1, 72)
  currentPassword: string;

  @ApiProperty({ description: PASSWORD_MESSAGE })
  @IsString()
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
