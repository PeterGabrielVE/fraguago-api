import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class FinancesService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

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

  // FIN-B02 — listado paginado, con filtro opcional por type.
  async findAll(
    gymId: string,
    { page = 1, pageSize = 20 }: PaginationDto,
    type?: TransactionType,
  ) {
    const where: Prisma.TransactionWhereInput = {
      gymId,
      ...(type ? { type } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(gymId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, gymId } });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async update(gymId: string, id: string, dto: UpdateTransactionDto) {
    await this.findOne(gymId, id);

    // Construimos el objeto explícitamente para no arrastrar 'date' como string
    // ni romper con fechas vacías/inválidas.
    const data: Prisma.TransactionUpdateInput = { ...dto };
    if (dto.date !== undefined) {
      data.date = new Date(dto.date);
    }

    return this.prisma.transaction.update({ where: { id }, data });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.transaction.delete({ where: { id } });
  }

  // FIN-B07 — income, expense y balance. Filtro opcional de fechas (from/to).
  async summary(gymId: string, from?: string, to?: string) {
    const where: Prisma.TransactionWhereInput = { gymId };

    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const grouped = await this.prisma.transaction.groupBy({
      by: ['type'],
      where,
      _sum: { amount: true },
    });

    const income = Number(grouped.find((g) => g.type === 'INCOME')?._sum.amount ?? 0);
    const expense = Number(grouped.find((g) => g.type === 'EXPENSE')?._sum.amount ?? 0);

    return { income, expense, balance: income - expense };
  }
}