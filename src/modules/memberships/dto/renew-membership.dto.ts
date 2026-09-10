import { IsUUID, IsDateString, IsOptional } from 'class-validator';

export class RenewMembershipDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}