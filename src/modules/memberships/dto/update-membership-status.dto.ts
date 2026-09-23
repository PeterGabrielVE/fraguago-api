import { MembershipStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

// DB-02 — cambio de estado administrativo (suspender, reactivar, cancelar).
export class UpdateMembershipStatusDto {
  @IsEnum(MembershipStatus)
  status!: MembershipStatus;
}
