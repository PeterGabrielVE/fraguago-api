import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateMeasurementDto {

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bodyFat?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  chestCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  waistCm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  armCm?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}