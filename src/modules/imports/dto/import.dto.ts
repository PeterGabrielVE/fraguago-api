import { Type } from 'class-transformer';
import { ImportType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_BATCH_ROWS = 50;

// Campos de texto del multipart de la vista previa (llegan como string).
export class PreviewImportDto {
  @IsEnum(ImportType)
  type!: ImportType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sheet?: string;

  // JSON { campo: índiceDeColumna | null } para corregir el mapeo automático.
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  mapping?: string;

  // Asistencia: la cuadrícula "Día 1..31" no dice de qué mes es.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}

export class CreateImportJobDto {
  @IsEnum(ImportType)
  type!: ImportType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(5000)
  totalRows!: number;
}

export class MemberImportRowDto {
  @IsInt()
  @Min(1)
  row!: number;

  @IsOptional() @IsString() @MaxLength(50)
  externalId?: string;

  @IsString() @IsNotEmpty() @MaxLength(80)
  firstName!: string;

  @IsString() @MaxLength(80)
  lastName!: string;

  @IsOptional() @IsString() @MaxLength(30)
  identificationNumber?: string;

  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(80)
  planName?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  price?: number;

  @IsOptional() @Matches(YMD)
  paymentDate?: string;

  @IsOptional() @IsInt() @Min(1) @Max(3650)
  validDays?: number;

  @IsOptional() @Matches(YMD)
  dueDate?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000)
  amount?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1_000_000_000)
  amountBs?: number;

  @IsOptional() @IsIn(['PAID', 'PENDING'])
  paymentStatus?: 'PAID' | 'PENDING';

  @IsOptional() @IsString() @MaxLength(500)
  notes?: string;
}

export class MembersImportOptionsDto {
  // Crear planes que no existan (p. ej. "Semanal") con la tarifa y días del archivo.
  @IsBoolean()
  createMissingPlans!: boolean;

  // Completar datos vacíos de socios que ya existen (ID externo, teléfono…).
  @IsBoolean()
  updateExisting!: boolean;
}

export class MembersBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ROWS)
  @ValidateNested({ each: true })
  @Type(() => MemberImportRowDto)
  rows!: MemberImportRowDto[];

  @ValidateNested()
  @Type(() => MembersImportOptionsDto)
  options!: MembersImportOptionsDto;
}

export class AttendanceImportRowDto {
  @IsInt()
  @Min(1)
  row!: number;

  @IsOptional() @IsString() @MaxLength(50)
  externalId?: string;

  @IsOptional() @IsString() @MaxLength(160)
  fullName?: string;

  @IsArray()
  @ArrayMaxSize(31)
  @Matches(YMD, { each: true })
  dates!: string[];
}

export class AttendanceBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_ROWS)
  @ValidateNested({ each: true })
  @Type(() => AttendanceImportRowDto)
  rows!: AttendanceImportRowDto[];
}
