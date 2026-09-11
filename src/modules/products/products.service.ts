import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  // PROD-B02
  create(gymId: string, dto: CreateProductDto) {
    return this.prisma.product.create({ data: { ...dto, gymId } });
  }

  // PROD-B01 — listado paginado
  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // PROD-B07 — productos con stock bajo (<= threshold).
  // Va ANTES de findOne en el controller para no chocar con :id.
  async lowStock(gymId: string, { page = 1, pageSize = 20, threshold = 5 }: LowStockQueryDto) {
    const where = { gymId, stock: { lte: threshold } };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { stock: 'asc' }, // los más críticos primero
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, pageSize, threshold, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // PROD-B03
  async findOne(gymId: string, id: string) {
    const row = await this.prisma.product.findFirst({ where: { id, gymId } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  // PROD-B04 — actualiza nombre/precio/sku, NO stock.
  async update(gymId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(gymId, id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  // PROD-B06 — ajuste atómico de stock por delta.
  async adjustStock(gymId: string, id: string, dto: AdjustStockDto) {
    if (dto.change === 0) {
      throw new BadRequestException('El cambio de stock no puede ser 0');
    }

    const product = await this.findOne(gymId, id); // valida tenant + existencia

    // Evita que el stock quede negativo (ej. vender 5 cuando hay 3).
    if (product.stock + dto.change < 0) {
      throw new BadRequestException(
        `Stock insuficiente. Actual: ${product.stock}, cambio: ${dto.change}`,
      );
    }

    // increment/decrement es atómico en la base: sin condición de carrera.
    return this.prisma.product.update({
      where: { id },
      data: { stock: { increment: dto.change } },
    });
  }

  // PROD-B05
  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.product.delete({ where: { id } });
  }
}