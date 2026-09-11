import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateTrainerDto {
  // --- MODO A: promover un usuario existente ---
  @IsOptional()
  @IsUUID()
  userId?: string;

  // --- MODO B: crear un usuario nuevo desde cero ---
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  // --- Común a ambos ---
  @IsOptional()
  @IsString()
  specialty?: string;
}