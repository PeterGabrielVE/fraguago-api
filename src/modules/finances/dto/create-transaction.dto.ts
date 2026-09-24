import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsPositive } from 'class-validator';
import { TransactionType, Currency } from '@prisma/client';
import { PaymentFieldsDto } from '../payment-details';

// Incluye los datos del comprobante (método, referencia, banco, foto…).
export class CreateTransactionDto extends PaymentFieldsDto {
  @IsEnum(TransactionType) type!: TransactionType;     // INCOME | EXPENSE
  @IsNumber() @IsPositive() amount!: number;
  @IsOptional() @IsEnum(Currency) currency?: Currency; // moneda en la que se pagó; default: moneda base del gym
  @IsOptional() @IsNumber() @IsPositive() exchangeRate?: number; // override manual; si no viene, se busca la última tasa registrada
  @IsOptional() @IsString() conceptId?: string;
  @IsOptional() @IsString() memberId?: string;         // for income tied to a member
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() date?: string;
}
