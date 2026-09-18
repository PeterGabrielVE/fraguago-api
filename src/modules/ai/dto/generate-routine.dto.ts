import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TrainingGoal, ActivityLevel } from '@prisma/client';

export class GenerateRoutineDto {
  @IsEnum(TrainingGoal)
  goal!: TrainingGoal; // MUSCLE_GAIN, WEIGHT_LOSS, etc.

  @IsEnum(ActivityLevel)
  level!: ActivityLevel; // BEGINNER, INTERMEDIATE, ADVANCED

  @IsInt()
  @Min(1)
  @Max(7)
  daysPerWeek!: number;

  @IsOptional()
  @IsString()
  notes?: string; // lesiones, equipamiento disponible, preferencias

  // Si viene, se incorpora automáticamente la ficha médica y la última
  // medición del socio al prompt (ver AiService.generateRoutine).
  @IsOptional()
  @IsUUID()
  memberId?: string;
}