import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

import {
  ActivityLevel,
  TrainingGoal,
  TrainingShift,
} from "@prisma/client";

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

  @IsString()
  identificationNumber!: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @IsOptional()
  @IsEnum(TrainingShift)
  preferredShift?: TrainingShift;

  @IsOptional()
  @IsEnum(TrainingGoal)
  primaryGoal?: TrainingGoal;

  @IsOptional()
  @IsString()
  goalDescription?: string;
}