import { Currency } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateExchangeRateDto {
  @IsEnum(Currency)
  currency!: Currency;

  // Cuántas unidades de `currency` equivalen a 1 unidad de la moneda base
  // del gym (ej. VES: 900 = "900 Bs. por USD").
  @IsNumber({ maxDecimalPlaces: 6 })
  @IsPositive()
  rate!: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string; // ej. "BCV", "paralelo", "manual"

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}
