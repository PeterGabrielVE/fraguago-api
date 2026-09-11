import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  // Positivo suma (entrada), negativo resta (salida/venta). No puede ser 0.
  @IsInt()
  change!: number;

  @IsOptional()
  @IsString()
  reason?: string; // opcional: "compra", "venta", "ajuste por inventario"
}