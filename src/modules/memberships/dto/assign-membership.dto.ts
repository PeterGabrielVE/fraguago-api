import { IsUUID, IsDateString, IsOptional } from 'class-validator';

export class AssignMembershipDto {
  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}