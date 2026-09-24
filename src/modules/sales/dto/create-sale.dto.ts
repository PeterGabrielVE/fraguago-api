import { Type } from 'class-transformer';
import { PaymentFieldsDto } from '../../finances/payment-details';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

// Incluye método y comprobante del pago (referencia, banco, foto…).
export class CreateSaleDto extends PaymentFieldsDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

}