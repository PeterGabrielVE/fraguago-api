import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  // 0 = domingo ... 6 = sábado (convención Date.getDay() de JS)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  // Formato 24h "HH:mm" con cero a la izquierda (ej. "08:00", "19:30").
  // El cero inicial es OBLIGATORIO: la comparación de solapamiento en el
  // service compara estas horas como texto, y solo ordena bien con 2 dígitos.
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime debe tener formato HH:mm (00:00–23:59)',
  })
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime debe tener formato HH:mm (00:00–23:59)',
  })
  endTime!: string;

  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}