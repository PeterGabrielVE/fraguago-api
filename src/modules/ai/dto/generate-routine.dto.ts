import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
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
}