import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ActivityLevel } from '@prisma/client';
import { UpsertEmergencyContactDto } from '../../members/dto/upsert-emergency-contact.dto';
import { UpsertMedicalProfileDto } from '../../members/dto/upsert-medical-profile.dto';

export const SYNC_OPERATION_TYPES = ['attendance.checkIn', 'member.create'] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Sobre de una operación hecha en el cliente (con o sin conexión). El gymId
// real sale del token; el que viaja aquí solo sirve para detectar una cola de
// otro gimnasio.
export class SyncOperationDto {
  // Clave de idempotencia generada en el cliente.
  @IsUUID()
  id!: string;

  @IsIn(SYNC_OPERATION_TYPES)
  type!: SyncOperationType;

  // Id (también del cliente) del registro que crea la operación.
  @IsUUID()
  entityId!: string;

  // Reloj del dispositivo al hacer la operación y al enviarla: el servidor usa
  // la diferencia, no la hora absoluta (un reloj mal puesto no la corre).
  @IsDateString()
  createdAt!: string;

  @IsDateString()
  sentAt!: string;

  @IsOptional()
  @IsString()
  gymId?: string;

  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncCheckInPayload {
  @IsString()
  @IsNotEmpty()
  memberId!: string;
}

// Alta de socio sin conexión. Sin contraseña: la inicial es la cédula (igual
// que en el panel), así la cola del navegador no guarda ninguna.
export class SyncMemberCreatePayload {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  firstName!: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  lastName!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(120)
  email!: string;

  @Transform(trim)
  @IsString()
  @MinLength(7)
  @MaxLength(30)
  identificationNumber!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEnum(ActivityLevel)
  activityLevel?: ActivityLevel;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  preferredTime?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertMedicalProfileDto)
  medicalProfile?: UpsertMedicalProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertEmergencyContactDto)
  emergencyContact?: UpsertEmergencyContactDto;
}
