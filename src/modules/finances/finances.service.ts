import { Injectable, NotFoundException } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class FinancesService {
  constructor(private readonly prisma: PrismaService) {}

  create(gymId: string, dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: {
        gymId,
        type: dto.type,
        amount: dto.amount,
        conceptId: dto.conceptId,
        memberId: dto.memberId,
        note: dto.note,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  // Optional filter by type: /api/transactions?type=INCOME
  findAll(gymId: string, type?: TransactionType) {
    return this.prisma.transaction.findMany({
      where: { gymId, ...(type ? { type } : {}) },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(gymId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, gymId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async update(gymId: string, id: string, dto: UpdateTransactionDto) {
    await this.findOne(gymId, id);
    return this.prisma.transaction.update({
      where: { id },
      data: { ...dto, date: dto.date ? new Date(dto.date) : undefined },
    });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.transaction.delete({ where: { id } });
  }

  // The payoff of merging: income, expense and balance in one query.
  async summary(gymId: string) {
    const grouped = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { gymId },
      _sum: { amount: true },
    });
    const income = Number(grouped.find((g) => g.type === 'INCOME')?._sum.amount ?? 0);
    const expense = Number(grouped.find((g) => g.type === 'EXPENSE')?._sum.amount ?? 0);
    return { income, expense, balance: income - expense };
  }
}
