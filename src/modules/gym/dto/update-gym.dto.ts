import { Currency } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '../../../common/slug';

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

  // Nombre corto del enlace público (/registro/<slug>). Cambiarlo invalida
  // los enlaces ya compartidos.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, { message: 'El enlace solo puede tener letras minúsculas, números y guiones (ej. mi-gym).' })
  slug?: string;
}
