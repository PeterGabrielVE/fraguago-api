import { BadgeCriteria } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBadgeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  // Clave de ícono que entiende el frontend (flame, trophy, star, medal…).
  @IsOptional()
  @IsString()
  @MaxLength(30)
  icon?: string;

  @IsOptional()
  @IsEnum(BadgeCriteria)
  criteria?: BadgeCriteria;

  // Requerido cuando criteria no es MANUAL (se valida en el servicio).
  @IsOptional()
  @IsInt()
  @Min(1)
  threshold?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pointsReward?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
