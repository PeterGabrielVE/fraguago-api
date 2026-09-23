import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// DB-06 — un ejercicio dentro de la rutina. Se referencia por `exerciseId`
// (del catálogo) o por `name` (se reutiliza o se crea en el catálogo); el
// servicio exige uno de los dos.
export class RoutineExerciseInputDto {
  @IsOptional()
  @IsUUID()
  exerciseId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  // Día de la rutina (1..7), no día de la semana.
  @IsInt()
  @Min(1)
  @Max(7)
  day!: number;

  // Posición dentro del día; si falta se usa el orden en que llegan.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  order?: number;

  @IsInt()
  @Min(1)
  @Max(20)
  sets!: number;

  // "10-12", "30s", "al fallo"…
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  reps!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(900)
  restSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
