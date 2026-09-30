import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Currency } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BcvRatesClient, rateAgainstBase, type BcvRates } from './bcv-rates.client';

// Fuente con la que se guardan las tasas automáticas (las manuales traen la suya o ninguna).
export const BCV_SOURCE = 'BCV';

@Injectable()
export class ExchangeRatesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly bcv: BcvRatesClient,
  ) {}

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

  // Tasa oficial del BCV convertida a la convención del gym (sin guardarla).
  async bcvPreview(gymId: string) {
    const bcv = await this.bcv.fetchRates();
    const base = await this.baseCurrency(gymId);
    return {
      source: BCV_SOURCE,
      baseCurrency: base,
      updatedAt: bcv.updatedAt,
      rates: this.convert(bcv, base),
      official: this.official(bcv),
    };
  }

  // Guarda la tasa del BCV para cada moneda distinta a la base, solo cuando el
  // valor cambió respecto de la última tasa BCV guardada (el servicio puede
  // renovar `updatedAt` sin que la tasa cambie).
  // Se guarda con la fecha de publicación del BCV: una tasa manual registrada
  // DESPUÉS de esa publicación sigue mandando hasta que el BCV publique otra.
  // Si el servicio está caído lanza 503 y los pagos siguen usando la última
  // tasa guardada (automática o manual).
  async syncFromBcv(gymId: string, force = false) {
    const bcv = await this.bcv.fetchRates(force);
    const base = await this.baseCurrency(gymId);
    const rates = this.convert(bcv, base);

    const created: { currency: Currency; rate: number }[] = [];
    for (const { currency, rate } of rates) {
      const lastBcv = await this.prisma.exchangeRate.findFirst({
        where: { gymId, currency, source: BCV_SOURCE },
        orderBy: { effectiveAt: 'desc' },
        select: { rate: true },
      });
      if (lastBcv && Number(lastBcv.rate) === rate) continue;
      await this.prisma.exchangeRate.create({
        data: { gymId, currency, rate, source: BCV_SOURCE, effectiveAt: bcv.updatedAt },
      });
      created.push({ currency, rate });
    }
    return { source: BCV_SOURCE, baseCurrency: base, updatedAt: bcv.updatedAt, rates, official: this.official(bcv), created: created.length };
  }

  private async baseCurrency(gymId: string): Promise<Currency> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { baseCurrency: true } });
    return gym?.baseCurrency ?? Currency.USD;
  }

  // Tasa tal como la publica el BCV: bolívares por 1 unidad de cada divisa.
  private official(bcv: BcvRates) {
    return (Object.entries(bcv.bsPer) as [Currency, number][])
      .filter(([currency]) => currency !== Currency.VES)
      .map(([currency, bs]) => ({ currency, bs }));
  }

  private convert(bcv: BcvRates, base: Currency) {
    return Object.values(Currency)
      .filter((currency) => currency !== base)
      .map((currency) => ({ currency, rate: rateAgainstBase(bcv, base, currency) }))
      .filter((r): r is { currency: Currency; rate: number } => r.rate !== null);
  }

  async remove(gymId: string, id: string) {
    const row = await this.prisma.exchangeRate.findFirst({ where: { id, gymId } });
    if (!row) throw new NotFoundException('Not found');
    return this.prisma.exchangeRate.delete({ where: { id } });
  }
}
