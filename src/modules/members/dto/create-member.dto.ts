import {
  IsEmail,
  IsOptional,
  IsString,
  IsDateString,
  MinLength,
} from 'class-validator';

export class CreateMemberDto {
  // ============================================================
  // USER / PROFILE
  // ============================================================

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // ============================================================
  // MEMBER
  // ============================================================

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  guardianName?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;
}