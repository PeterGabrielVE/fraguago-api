import { Currency } from '@prisma/client';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export class UpdateGymDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEnum(Currency)
  baseCurrency?: Currency;

  // Aforo máximo; null lo deja sin límite.
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxCapacity?: number | null;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(720)
  avgVisitMinutes?: number;
}
