import { PartialType } from '@nestjs/mapped-types';
import { CreateMemberDto } from './create-member.dto';
import { MemberStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberDto extends PartialType(CreateMemberDto) {}

export class ChangeStatusDto {
  @IsEnum(MemberStatus)
  status!: MemberStatus;
}