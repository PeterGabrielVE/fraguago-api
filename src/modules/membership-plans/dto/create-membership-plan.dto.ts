import { MembershipType } from '@prisma/client';
import { IsString, IsNotEmpty, IsOptional, IsNumber, IsInt, IsBoolean, Min, MaxLength, IsEnum } from 'class-validator';

export class CreateMembershipPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEnum(MembershipType)
  type!: MembershipType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}