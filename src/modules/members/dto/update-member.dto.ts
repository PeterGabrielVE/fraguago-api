import {
  IsEmail,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { MemberStatus } from "@prisma/client";
export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  guardianPhone?: string;

  @IsOptional()
  @IsEnum(MemberStatus)
  status?: MemberStatus;
}
