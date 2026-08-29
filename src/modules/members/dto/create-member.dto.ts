import { IsOptional, IsString, IsEmail, IsDateString } from 'class-validator';

export class CreateMemberDto {
  @IsString() fullName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsDateString() birthDate?: string;   // 'YYYY-MM-DD'
  @IsOptional() @IsString() guardianName?: string;
  @IsOptional() @IsString() guardianPhone?: string;
}
