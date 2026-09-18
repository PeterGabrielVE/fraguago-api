import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma, TransactionType } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class FinancesService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  // Resuelve currency/exchangeRate/amountBase para un pago.
  // amountBase siempre queda en la moneda base del gym (Gym.baseCurrency).
  // Convención de exchangeRate: "cuántas unidades de currency equivalen a 1
  // unidad de la moneda base" (ej. VES: 900 => 900 Bs = 1 USD), que es como
  // el staff piensa "la tasa del día" en la práctica. Por eso se divide, no
  // se multiplica: amountBase = amount / exchangeRate.
  // Si currency ya es la moneda base, exchangeRate es 1 y amountBase = amount.
  private async resolveCurrency(
    gymId: string,
    amount: number,
    currency?: Currency,
    exchangeRateOverride?: number,
  ) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { baseCurrency: true } });
    if (!gym) throw new NotFoundException('Gym not found');

    const resolvedCurrency = currency ?? gym.baseCurrency;

    if (resolvedCurrency === gym.baseCurrency) {
      return { currency: resolvedCurrency, exchangeRate: 1, amountBase: amount };
    }

    let rate = exchangeRateOverride;
    if (!rate) {
      const latest = await this.prisma.exchangeRate.findFirst({
        where: { gymId, currency: resolvedCurrency },
        orderBy: { effectiveAt: 'desc' },
      });
      if (!latest) {
        throw new BadRequestException(
          `No hay tasa de cambio registrada para ${resolvedCurrency}. Registra una en /exchange-rates o envía "exchangeRate" manualmente.`,
        );
      }
      rate = Number(latest.rate);
    }

    return { currency: resolvedCurrency, exchangeRate: rate, amountBase: Math.round((amount / rate) * 100) / 100 };
  }

  async create(gymId: string, dto: CreateTransactionDto) {
    const { currency, exchangeRate, amountBase } = await this.resolveCurrency(
      gymId,
      dto.amount,
      dto.currency,
      dto.exchangeRate,
    );

    return this.prisma.transaction.create({
      data: {
        gymId,
        type: dto.type,
        amount: dto.amount,
        currency,
        exchangeRate,
        amountBase,
        conceptId: dto.conceptId,
        memberId: dto.memberId,
        note: dto.note,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  // FIN-B02 / FIN-F06 — listado paginado, con filtros opcionales por type,
  // conceptId y rango de fechas (mismo patrón que summary()).
  async findAll(
    gymId: string,
    { page = 1, pageSize = 20 }: PaginationDto,
    type?: TransactionType,
    conceptId?: string,
    from?: string,
    to?: string,
  ) {
    // Ya no pasa por el ValidationPipe de PaginationDto (ver controller), así
    // que el límite de pageSize se aplica acá a mano.
    const safePage = Math.max(1, page);
    const safePageSize = Math.min(100, Math.max(1, pageSize));

    const where: Prisma.TransactionWhereInput = {
      gymId,
      ...(type ? { type } : {}),
      ...(conceptId ? { conceptId } : {}),
    };
    if (from || to) {
      where.date = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
        include: { concept: true },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: safePage, pageSize: safePageSize, totalPages: Math.ceil(total / safePageSize) },
    };
  }

  async findOne(gymId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({ where: { id, gymId }, include: { concept: true } });
    if (!tx) throw new NotFoundException('Transaction not found');
    return tx;
  }

  async update(gymId: string, id: string, dto: UpdateTransactionDto) {
    const current = await this.findOne(gymId, id);

    // Construimos el objeto explícitamente para no arrastrar 'date' como string
    // ni romper con fechas vacías/inválidas.
    const data: Prisma.TransactionUpdateInput = { ...dto };
    if (dto.date !== undefined) {
      data.date = new Date(dto.date);
    }

    // Si cambia el monto, la moneda o la tasa, hay que recalcular amountBase.
    if (dto.amount !== undefined || dto.currency !== undefined || dto.exchangeRate !== undefined) {
      const { currency, exchangeRate, amountBase } = await this.resolveCurrency(
        gymId,
        dto.amount ?? Number(current.amount),
        dto.currency ?? current.currency,
        dto.exchangeRate,
      );
      data.currency = currency;
      data.exchangeRate = exchangeRate;
      data.amountBase = amountBase;
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

    // Sumamos amountBase (todo ya convertido a la moneda base del gym), no
    // amount crudo: mezclar USD/VES/EUR sin convertir daría un total sin sentido.
    const [grouped, gym] = await Promise.all([
      this.prisma.transaction.groupBy({
        by: ['type'],
        where,
        _sum: { amountBase: true },
      }),
      this.prisma.gym.findUnique({ where: { id: gymId }, select: { baseCurrency: true } }),
    ]);

    const income = Number(grouped.find((g) => g.type === 'INCOME')?._sum.amountBase ?? 0);
    const expense = Number(grouped.find((g) => g.type === 'EXPENSE')?._sum.amountBase ?? 0);

    return { income, expense, balance: income - expense, currency: gym?.baseCurrency };
  }
}