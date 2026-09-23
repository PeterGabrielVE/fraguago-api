import { IsArray, IsOptional, IsUUID } from 'class-validator';

// Sin ids = marca como vistas TODAS las insignias pendientes del socio.
export class MarkBadgesSeenDto {
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  ids?: string[];
}
