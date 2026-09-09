import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Datos que llegan desde el formulario "Ficha Médica".
 * Todos opcionales: un socio nuevo puede no tener nada marcado.
 *
 * gymId y memberId NO viven aquí:
 *   - gymId    -> se toma del usuario autenticado (tenant, @GymId()).
 *   - memberId -> llega por la URL (@Param('id')).
 */
export class UpsertMedicalProfileDto {
  // --- Condiciones de salud ---
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

  // --- Limitaciones físicas ---
  @IsOptional()
  @IsBoolean()
  hasInjury?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  injuryDescription?: string;

  // --- Medicación continua ---
  @IsOptional()
  @IsBoolean()
  takesMedication?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  medicationDescription?: string;
}