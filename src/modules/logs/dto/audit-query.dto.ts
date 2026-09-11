import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AuditQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}