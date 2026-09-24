import { Type } from 'class-transformer';
import { IsUUID, IsDateString, IsOptional, ValidateNested } from 'class-validator';
import { MembershipPaymentDto } from './membership-payment.dto';

export class AssignMembershipDto {
  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  // Cómo se pagó (método, referencia, comprobante, monto real).
  @IsOptional()
  @ValidateNested()
  @Type(() => MembershipPaymentDto)
  payment?: MembershipPaymentDto;
}
