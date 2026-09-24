import { Currency } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { PaymentFieldsDto } from '../../finances/payment-details';

// Pago que acompaña a asignar/renovar una membresía: método y comprobante
// (referencia, banco, foto) y, si el socio pagó otro monto o en otra moneda
// (p. ej. en Bs por pago móvil), el monto real pagado.
export class MembershipPaymentDto extends PaymentFieldsDto {
  // Por defecto: precio del plan.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;

  // Por defecto: moneda del plan.
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  // Tasa del día si se pagó en otra moneda (si falta, se usa la última registrada).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
