import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Cantidad SIEMPRE positiva: el endpoint (otorgar / deducir) define el signo.
export class AdjustPointsDto {
  @IsInt()
  @Min(1)
  @Max(100000)
  points!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
