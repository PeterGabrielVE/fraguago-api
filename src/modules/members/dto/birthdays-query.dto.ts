import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

// GET /members/birthdays
//   ?days=7   -> cumpleaños de hoy a 7 días (incluye hoy)
//   ?month=10 -> todos los del mes (1-12)
// Sin parámetros -> los del mes actual.
export class BirthdaysQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
