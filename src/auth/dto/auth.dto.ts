import { IsString, IsNotEmpty, IsEmail, IsEnum, IsOptional, MinLength } from "class-validator";
import { Role } from "@prisma/client";

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  // Opcional: si el usuario tiene varios roles y ya sabe con cuál entrar.
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class SelectRoleDto {
  @IsString()
  @IsNotEmpty()
  selectionToken!: string;

  @IsEnum(Role)
  role!: Role;
}

export class SwitchRoleDto {
  @IsEnum(Role)
  role!: Role;
}

export class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}

export class RegisterGymDto {
  @IsString()
  @IsNotEmpty()
  gymName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsString()
  @MinLength(7)
  ownerPassword!: string;

  @IsString()
  @IsNotEmpty()
  ownerName!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
