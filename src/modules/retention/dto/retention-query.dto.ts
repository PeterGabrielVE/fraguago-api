import { Type } from 'class-transformer';
import { MessageStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class InactiveMembersQueryDto {
  // RET-B02 — umbral de inasistencia (por defecto, más de 4 días).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number = 4;
}

export class MessageLogQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MessageStatus)
  status?: MessageStatus;
}
