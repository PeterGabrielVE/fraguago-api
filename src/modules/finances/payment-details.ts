import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

// Datos del comprobante de un pago. Se usa en el alta manual de transacciones
// y en el pago de membresías (asignar / renovar).
export class PaymentFieldsDto {
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  // Nº de referencia / confirmación. Se normaliza según el método.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentBank?: string;

  @IsOptional()
  @Matches(/^[+\d\s()-]{7,20}$/, { message: 'payerPhone no es un teléfono válido' })
  payerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payerName?: string;

  // Foto del comprobante subida antes con POST /payments/receipts.
  @IsOptional()
  @IsUUID()
  receiptId?: string;
}

export type NormalizedPayment = {
  paymentMethod?: PaymentMethod;
  paymentReference?: string;
  paymentBank?: string;
  payerPhone?: string;
  payerName?: string;
};

// Métodos que siempre tienen un número de referencia.
const REFERENCE_REQUIRED: PaymentMethod[] = [PaymentMethod.PAGO_MOVIL, PaymentMethod.TRANSFER];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  PAGO_MOVIL: 'Pago móvil',
  ZELLE: 'Zelle',
  OTHER: 'Otro',
};

// Normaliza y valida los datos del comprobante:
//  - Pago móvil: la referencia son solo dígitos (los bancos la muestran con
//    espacios o guiones); 4 a 20 dígitos.
//  - Transferencia / Zelle / tarjeta / otro: alfanumérica en mayúsculas.
//  - Efectivo: no lleva referencia ni banco.
export function normalizePayment(input: PaymentFieldsDto): NormalizedPayment {
  const method = input.paymentMethod;
  const clean = (s?: string) => s?.replace(/\s+/g, ' ').trim() || undefined;
  let reference = clean(input.paymentReference);

  if (method === PaymentMethod.CASH) {
    return { paymentMethod: method };
  }

  if (reference) {
    reference = method === PaymentMethod.PAGO_MOVIL
      ? reference.replace(/\D/g, '')
      : reference.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (method === PaymentMethod.PAGO_MOVIL && !/^\d{4,20}$/.test(reference)) {
      throw new BadRequestException('La referencia del pago móvil debe tener entre 4 y 20 dígitos');
    }
    if (reference.length < 4) {
      throw new BadRequestException('La referencia debe tener al menos 4 caracteres');
    }
  }
  if (method && REFERENCE_REQUIRED.includes(method) && !reference) {
    throw new BadRequestException(
      method === PaymentMethod.PAGO_MOVIL
        ? 'Indica el número de referencia del pago móvil'
        : 'Indica el número de referencia de la transferencia',
    );
  }

  return {
    paymentMethod: method,
    paymentReference: reference,
    paymentBank: clean(input.paymentBank),
    payerPhone: input.payerPhone?.replace(/[^\d+]/g, '') || undefined,
    payerName: clean(input.payerName),
  };
}
