import {
  ArrayNotEmpty, ArrayUnique, IsArray, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(7)
  password!: string;

  // Opcional para no romper clientes que no lo mandan; si viene, debe coincidir.
  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // Uno o varios roles; `role` se mantiene por compatibilidad (un solo rol).
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Role, { each: true })
  roles?: Role[];

  @IsOptional()
  @IsString()
  phone?: string;
}