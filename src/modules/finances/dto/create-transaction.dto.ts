import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsPositive } from 'class-validator';
import { TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType) type!: TransactionType;     // INCOME | EXPENSE
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsString() conceptId?: string;
  @IsOptional() @IsString() memberId?: string;         // for income tied to a member
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() date?: string;
}
