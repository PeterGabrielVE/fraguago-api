import { ReferralStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ApplyReferralDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @IsUUID()
  referredMemberId!: string;
}

export class ValidateReferralQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code!: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export class ListReferralsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;
}
