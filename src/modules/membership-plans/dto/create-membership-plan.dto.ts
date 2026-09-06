import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsString,
  Min,
} from 'class-validator';
import { MembershipType } from '@prisma/client';

export class CreateMembershipPlanDto {
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  name!: string;

  @IsEnum(MembershipType, {
    message: 'type debe ser DAILY, MONTHLY, QUARTERLY o ANNUAL',
  })
  type!: MembershipType;

  // Decimal(10,2): validamos como número con 2 decimales máximo.
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'price debe ser un número con máximo 2 decimales' },
  )
  @Min(0, { message: 'price no puede ser negativo' })
  price!: number;

  @IsInt({ message: 'durationDays debe ser un entero' })
  @Min(1, { message: 'durationDays debe ser al menos 1' })
  durationDays!: number;
}