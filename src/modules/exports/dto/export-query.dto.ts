import { AttendanceShift, MemberStatus, TransactionType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export const EXPORT_RESOURCES = ['members', 'attendance', 'finances'] as const;
export type ExportResource = (typeof EXPORT_RESOURCES)[number];
export type ExportFormat = 'csv' | 'xlsx';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// MIG-B03 — filtros comunes; cada recurso usa los que le aplican (los mismos
// que ya ofrecen sus pantallas).
export class ExportQueryDto {
  @IsOptional()
  @IsIn(['csv', 'xlsx'])
  format?: ExportFormat = 'xlsx';

  // Rango de fechas (asistencia, finanzas, alta de socios).
  @IsOptional()
  @Matches(YMD, { message: 'from debe tener el formato YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(YMD, { message: 'to debe tener el formato YYYY-MM-DD' })
  to?: string;

  // Socios
  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  // Asistencia
  @IsOptional()
  @IsEnum(AttendanceShift)
  shift?: AttendanceShift;

  @IsOptional()
  @IsUUID()
  memberId?: string;

  // Finanzas
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsUUID()
  conceptId?: string;
}
