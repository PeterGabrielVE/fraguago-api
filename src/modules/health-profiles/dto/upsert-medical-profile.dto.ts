// src/health-profiles/dto/upsert-medical-profile.dto.ts
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Datos que llegan desde el formulario "Ficha Médica".
 * Todos opcionales: un socio nuevo puede no tener nada marcado.
 * gymId y memberId NO viven aquí:
 *   - gymId  -> se toma del usuario autenticado (tenant).
 *   - memberId -> llega por query param.
 */
export class UpsertMedicalProfileDto {
  @IsOptional()
  @IsBoolean()
  hypertension?: boolean;

  @IsOptional()
  @IsBoolean()
  diabetes?: boolean;

  @IsOptional()
  @IsBoolean()
  heartProblems?: boolean;

  @IsOptional()
  @IsBoolean()
  asthma?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  otherConditions?: string;

  @IsOptional()
  @IsBoolean()
  hasInjury?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  injuryDescription?: string;

  @IsOptional()
  @IsBoolean()
  takesMedication?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  medicationDescription?: string;
}