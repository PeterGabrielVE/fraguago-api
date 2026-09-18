import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class ExchangeRatesService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  create(gymId: string, dto: CreateExchangeRateDto) {
    return this.prisma.exchangeRate.create({
      data: {
        gymId,
        currency: dto.currency,
        rate: dto.rate,
        source: dto.source,
        effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : undefined,
      },
    });
  }

  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto, currency?: Currency) {
    const where = { gymId, ...(currency ? { currency } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.exchangeRate.findMany({
        where,
        orderBy: { effectiveAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.exchangeRate.count({ where }),
    ]);
    return { data, meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) } };
  }

  // Última tasa registrada por cada moneda distinta a la base del gym: lo que
  // usan los pagos cuando no mandan exchangeRate manual.
  async latest(gymId: string) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { baseCurrency: true } });
    const currencies = Object.values(Currency).filter((c) => c !== gym?.baseCurrency);

    const rates = await Promise.all(
      currencies.map((currency) =>
        this.prisma.exchangeRate.findFirst({ where: { gymId, currency }, orderBy: { effectiveAt: 'desc' } }),
      ),
    );
    return rates.filter((r): r is NonNullable<typeof r> => r !== null);
  }

  async remove(gymId: string, id: string) {
    const row = await this.prisma.exchangeRate.findFirst({ where: { id, gymId } });
    if (!row) throw new NotFoundException('Not found');
    return this.prisma.exchangeRate.delete({ where: { id } });
  }
}
