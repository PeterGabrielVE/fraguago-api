import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsNotEmpty, IsUUID, ValidateNested } from 'class-validator';
import { RoutineExerciseInputDto } from './routine-exercise.dto';

export class CreateRoutineDto {
  @IsUUID()
  memberId!: string; 
  
  @IsOptional()
  @IsUUID()
  trainerId?: string; 

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  // DB-06 — ejercicios estructurados. En el update, si viene, REEMPLAZA la
  // lista completa (lo más simple de mantener consistente con el orden).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => RoutineExerciseInputDto)
  exercises?: RoutineExerciseInputDto[];
}