import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma, TransactionType } from "@prisma/client";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { PaginationDto } from "../../common/dto/pagination.dto";

@Injectable()
export class SalesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  private readonly saleInclude = {
    items: {
      include: { product: { select: { id: true, name: true, sku: true } } },
    },
    member: {
      select: {
        id: true,
        user: {
          select: { profile: { select: { firstName: true, lastName: true } } },
        },
      },
    },
  } as const;

  // Registrar una venta con uno o varios productos (carrito).
  async create(gymId: string, dto: CreateSaleDto, userId?: string) {
    // Validar socio si viene.
    if (dto.memberId) {
      const member = await this.prisma.member.findFirst({
        where: { id: dto.memberId, gymId },
      });
      if (!member)
        throw new NotFoundException("Socio no encontrado en este gimnasio");
    }

    // Consolidar cantidades por si mandan el mismo producto dos veces.
    const qtyByProduct = new Map<string, number>();
    for (const item of dto.items) {
      qtyByProduct.set(
        item.productId,
        (qtyByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }

    // Traer todos los productos de una y validar que sean de este gym.
    const productIds = [...qtyByProduct.keys()];
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, gymId },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException(
        "Uno o más productos no existen en este gimnasio",
      );
    }

    // Validar stock y armar las líneas antes de escribir nada.
    const items = products.map((p) => {
      const qty = qtyByProduct.get(p.id)!;
      if (p.stock < qty) {
        throw new BadRequestException(
          `Stock insuficiente de "${p.name}". Disponible: ${p.stock}, pedido: ${qty}`,
        );
      }
      const unitPrice = p.price;
      const subtotal = new Prisma.Decimal(unitPrice).mul(qty);
      return { product: p, qty, unitPrice, subtotal };
    });

    const total = items.reduce(
      (acc, it) => acc.add(it.subtotal),
      new Prisma.Decimal(0),
    );

    // TODO junto o nada: venta + items + descuento de stock + movimientos + ingreso.
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          gymId,
          memberId: dto.memberId,
          total,
          createdById: userId,
          items: {
            create: items.map((it) => ({
              gymId,
              productId: it.product.id,
              quantity: it.qty,
              unitPrice: it.unitPrice,
              subtotal: it.subtotal,
            })),
          },
        },
        include: this.saleInclude,
      });

      for (const it of items) {
        await tx.product.update({
          where: { id: it.product.id },
          data: { stock: { decrement: it.qty } },
        });
        await tx.stockMovement.create({
          data: {
            gymId,
            productId: it.product.id,
            change: -it.qty,
            resultingStock: it.product.stock - it.qty,
            reason: `Venta ${sale.id}`,
            createdById: userId,
          },
        });
      }

      await tx.transaction.create({
        data: {
          gymId,
          type: TransactionType.INCOME,
          amount: total,
          memberId: dto.memberId,
          note: `Venta POS ${sale.id}`,
          createdById: userId,
        },
      });

      return sale;
    });
  }

  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        orderBy: { soldAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.saleInclude,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(gymId: string, id: string) {
    const row = await this.prisma.sale.findFirst({
      where: { id, gymId },
      include: this.saleInclude,
    });
    if (!row) throw new NotFoundException("Venta no encontrada");
    return row;
  }

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // SALE-B04 — ventas de hoy.
  today(gymId: string) {
    return this.prisma.sale.findMany({
      where: { gymId, soldAt: { gte: this.startOfToday() } },
      orderBy: { soldAt: "desc" },
      include: this.saleInclude,
    });
  }

  // SALE-B05 — resumen de ventas. Rango opcional (from/to); default = hoy.
  async summary(gymId: string, from?: string, to?: string) {
    const start = from ? new Date(from) : this.startOfToday();
    const end = to ? new Date(to) : undefined;

    const where = {
      gymId,
      soldAt: { gte: start, ...(end ? { lte: end } : {}) },
    };

    // Total facturado y cantidad de ventas en el rango.
    const [agg, count] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ where, _sum: { total: true } }),
      this.prisma.sale.count({ where }),
    ]);

    // Unidades vendidas (suma de quantity de los items del rango).
    const itemsAgg = await this.prisma.saleItem.aggregate({
      where: { gymId, sale: { soldAt: where.soldAt } },
      _sum: { quantity: true },
    });

    return {
      from: start,
      to: end ?? null,
      totalSales: count, // nº de ventas
      totalRevenue: Number(agg._sum.total ?? 0), // dinero facturado
      unitsSold: itemsAgg._sum.quantity ?? 0, // unidades despachadas
    };
  }
}
