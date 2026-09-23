import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExerciseDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  muscleGroup?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  equipment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateExerciseDto extends PartialType(CreateExerciseDto) {}

export class SearchExercisesDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
