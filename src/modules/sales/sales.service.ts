import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  // Records a sale, decrements product stock, and creates a matching
  // INCOME transaction — all atomically in one DB transaction.
  async create(gymId: string, input: { productId: string; quantity?: number; memberId?: string }) {
    const quantity = input.quantity ?? 1;
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, gymId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.stock < quantity) throw new BadRequestException('Not enough stock');

    const unitPrice = product.price;
    const total = Number(unitPrice) * quantity;

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: { gymId, productId: product.id, memberId: input.memberId, quantity, unitPrice, total },
      });
      await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: quantity } } });
      await tx.transaction.create({
        data: { gymId, type: 'INCOME', memberId: input.memberId, amount: total, note: `Sale: ${product.name}` },
      });
      return sale;
    });
  }

  findAll(gymId: string) {
    return this.prisma.sale.findMany({
      where: { gymId },
      orderBy: { soldAt: 'desc' },
      include: { product: { select: { name: true } } },
    });
  }
}
