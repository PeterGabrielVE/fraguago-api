import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export const KIOSK_SYNC_MAX_BATCH = 50;

export class KioskEntryDto {
  // Generado en el kiosko: clave de idempotencia e id de la asistencia.
  @IsUUID()
  id!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  identificationNumber!: string;

  // Reloj del kiosko cuando el socio marcó.
  @IsDateString()
  createdAt!: string;
}

// Entradas que el kiosko guardó sin conexión, enviadas en lote.
export class PublicSyncCheckInDto {
  // Reloj del kiosko al enviar: la hora real sale de la diferencia con createdAt.
  @IsDateString()
  sentAt!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(KIOSK_SYNC_MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => KioskEntryDto)
  entries!: KioskEntryDto[];
}
