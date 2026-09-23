import { ChallengeMetric } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

// Las reglas que cruzan campos (fin > inicio, duración máxima, meta posible
// para ATTENDANCE_DAYS, fin en el futuro) se validan en ChallengesService.
export class CreateChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(ChallengeMetric)
  metric!: ChallengeMetric;

  @IsInt()
  @Min(1)
  @Max(1000)
  goal!: number;

  // "YYYY-MM-DD" = desde el inicio de ese día (hora local del servidor).
  @IsDateString()
  startsAt!: string;

  // "YYYY-MM-DD" = hasta el final de ese día (hora local del servidor).
  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  pointsReward?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  maxParticipants?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
