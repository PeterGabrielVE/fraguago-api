import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, PaymentMethod, Prisma, TransactionType } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { NormalizedPayment, PAYMENT_METHOD_LABELS, normalizePayment } from './payment-details';

// Cliente dentro de un $transaction interactivo.
export type FinanceTx = Parameters<Parameters<ScopedPrismaClient['$transaction']>[0] extends infer F
  ? F extends (tx: any) => any ? F : never
  : never>[0];

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

  // `tx` opcional: permite registrar el ingreso dentro de una transacción
  // mayor (p. ej. la importación: membresía + pago, todo o nada).
  // Anti-fraude: la misma referencia no puede usarse dos veces con el mismo
  // método (reusar la captura de un pago móvil). El índice único parcial de
  // la base cubre además las carreras entre dos requests simultáneos.
  private async assertReferenceFree(
    client: Pick<FinanceTx, 'transaction'>,
    gymId: string,
    payment: NormalizedPayment,
    exceptId?: string,
  ) {
    if (!payment.paymentReference || !payment.paymentMethod) return;
    const used = await client.transaction.findFirst({
      where: {
        gymId,
        paymentMethod: payment.paymentMethod,
        paymentReference: payment.paymentReference,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { date: true, amount: true, currency: true },
    });
    if (used) {
      throw new ConflictException(
        `La referencia ${payment.paymentReference} (${PAYMENT_METHOD_LABELS[payment.paymentMethod]}) ya fue registrada ` +
        `el ${used.date.toLocaleDateString('es-VE')} por ${used.amount} ${used.currency}`,
      );
    }
  }

  // `tx` opcional: permite registrar el ingreso dentro de una transacción
  // mayor (venta, membresía, importación): todo o nada.
  async create(
    gymId: string,
    dto: CreateTransactionDto,
    tx?: FinanceTx,
    links?: { saleId?: string; createdById?: string; paymentMethod?: PaymentMethod | null },
  ) {
    const payment = normalizePayment({ ...dto, paymentMethod: dto.paymentMethod ?? links?.paymentMethod ?? undefined });
    const { currency, exchangeRate, amountBase } = await this.resolveCurrency(
      gymId,
      dto.amount,
      dto.currency,
      dto.exchangeRate,
    );

    const run = async (client: FinanceTx) => {
      await this.assertReferenceFree(client, gymId, payment);
      let created;
      try {
        created = await client.transaction.create({
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
            saleId: links?.saleId,
            createdById: links?.createdById,
            ...payment,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && payment.paymentReference) {
          throw new ConflictException(`La referencia ${payment.paymentReference} ya fue registrada`);
        }
        throw err;
      }
      // Adjunta la foto del comprobante (subida antes y aún sin usar).
      if (dto.receiptId) {
        const { count } = await client.paymentReceipt.updateMany({
          where: { id: dto.receiptId, gymId, transactionId: null },
          data: { transactionId: created.id },
        });
        if (count === 0) throw new BadRequestException('El comprobante no existe o ya está asociado a otro pago');
      }
      return created;
    };
    return tx ? run(tx) : this.prisma.$transaction((t) => run(t));
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
        // Solo el id del comprobante (la imagen se pide aparte).
        include: { concept: true, receipt: { select: { id: true } } },
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

  // DB-05 — el ingreso de una venta POS es parte de la venta: editarlo o
  // borrarlo desde Finanzas dejaría la venta y la caja desalineadas.
  private assertNotFromSale(tx: { saleId: string | null }) {
    if (tx.saleId) {
      throw new BadRequestException(
        'Este ingreso pertenece a una venta del punto de venta y no se edita desde Finanzas',
      );
    }
  }

  async update(gymId: string, id: string, dto: UpdateTransactionDto) {
    const current = await this.findOne(gymId, id);
    this.assertNotFromSale(current);

    // Construimos el objeto explícitamente para no arrastrar 'date' como string
    // ni romper con fechas vacías/inválidas. El comprobante solo se adjunta al
    // crear el pago (receiptId no aplica en la edición).
    const { receiptId: _receiptId, ...rest } = dto;
    const data: Prisma.TransactionUpdateInput = { ...rest };

    // Si cambian los datos del pago, se normalizan y se revalida la referencia.
    const paymentKeys = ['paymentMethod', 'paymentReference', 'paymentBank', 'payerPhone', 'payerName'] as const;
    if (paymentKeys.some((k) => dto[k] !== undefined)) {
      const payment = normalizePayment({
        paymentMethod: dto.paymentMethod ?? current.paymentMethod ?? undefined,
        paymentReference: dto.paymentReference ?? current.paymentReference ?? undefined,
        paymentBank: dto.paymentBank ?? current.paymentBank ?? undefined,
        payerPhone: dto.payerPhone ?? current.payerPhone ?? undefined,
        payerName: dto.payerName ?? current.payerName ?? undefined,
      });
      await this.assertReferenceFree(this.prisma, gymId, payment, id);
      Object.assign(data, {
        paymentMethod: payment.paymentMethod ?? null,
        paymentReference: payment.paymentReference ?? null,
        paymentBank: payment.paymentBank ?? null,
        payerPhone: payment.payerPhone ?? null,
        payerName: payment.payerName ?? null,
      });
    }
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
    this.assertNotFromSale(await this.findOne(gymId, id));
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