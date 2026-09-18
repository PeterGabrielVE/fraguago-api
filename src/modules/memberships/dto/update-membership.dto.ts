import { IsUUID, IsDateString, IsOptional } from 'class-validator';

// Para corregir una membresía mal cargada (socio o plan equivocado), NO para
// renovar: no genera un nuevo cobro. Ver RenewMembershipDto para eso.
export class UpdateMembershipDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}
