import { RewardType } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRewardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(RewardType)
  type!: RewardType;

  // % (DISCOUNT_PERCENT) o monto (DISCOUNT_AMOUNT). Se valida en el servicio.
  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsInt()
  @Min(1)
  pointsCost!: number;

  // null/ausente = stock ilimitado.
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minLifetimePoints?: number;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
