import { Inject, Injectable } from '@nestjs/common';
import { MemberStatus, TransactionType } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from 'src/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  // ---- helpers de fechas ----
  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  private startOfMonth(): Date {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  private daysAgo(n: number): Date {
    const d = this.startOfToday();
    d.setDate(d.getDate() - n);
    return d;
  }

  // Agrupa registros por día (YYYY-MM-DD) rellenando los días sin datos con 0.
  private bucketByDay<T>(
    rows: T[],
    getDate: (r: T) => Date,
    getValue: (r: T) => number,
    from: Date,
    to: Date,
  ) {
    const buckets = new Map<string, number>();
    // Sembramos todos los días del rango en 0.
    for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const key = getDate(r).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, buckets.get(key)! + getValue(r));
    }
    return [...buckets.entries()].map(([date, value]) => ({ date, value }));
  }


    async all(gymId: string) {
        const [summary, members, attendance, revenue, expenses, memberships, sales] =
        await Promise.all([
            this.summary(gymId),
            this.members(gymId),
            this.attendance(gymId),
            this.revenue(gymId),
            this.expenses(gymId),
            this.memberships(gymId),
            this.sales(gymId),
        ]);
        return { summary, members, attendance, revenue, expenses, memberships, sales };
    }
  // ============================================================
  // B01 — GET /dashboard/summary
  // KPIs de cabecera: socios activos, check-ins de hoy,
  // membresías vigentes, e ingresos/gastos/balance del mes.
  // ============================================================
  async summary(gymId: string) {
    const now = new Date();
    const startDay = this.startOfToday();
    const startMonth = this.startOfMonth();

    const [activeMembers, activeMemberships, attendanceToday, monthTx] =
      await Promise.all([
        this.prisma.member.count({
          where: { gymId, status: MemberStatus.ACTIVE },
        }),
        // FIX: Membership.status es String "active", NO el enum MemberStatus.
        this.prisma.membership.count({
          where: { gymId, status: 'active', endDate: { gte: now } },
        }),
        this.prisma.attendance.count({
          where: { gymId, checkedInAt: { gte: startDay } },
        }),
        this.prisma.transaction.groupBy({
          by: ['type'],
          where: { gymId, date: { gte: startMonth } },
          _sum: { amount: true },
        }),
      ]);

    const income = Number(
      monthTx.find((t) => t.type === TransactionType.INCOME)?._sum.amount ?? 0,
    );
    const expense = Number(
      monthTx.find((t) => t.type === TransactionType.EXPENSE)?._sum.amount ?? 0,
    );

    return {
      activeMembers,
      activeMemberships,
      attendanceToday,
      month: { income, expense, balance: income - expense },
    };
  }

  // ============================================================
  // B02 — GET /dashboard/members
  // Reparto por estado + altas del mes.
  // ============================================================
  async members(gymId: string) {
    const startMonth = this.startOfMonth();

    const [grouped, newThisMonth, total] = await Promise.all([
      this.prisma.member.groupBy({
        by: ['status'],
        where: { gymId },
        _count: { _all: true },
      }),
      this.prisma.member.count({
        where: { gymId, joinedAt: { gte: startMonth } },
      }),
      this.prisma.member.count({ where: { gymId } }),
    ]);

    const byStatus = { ACTIVE: 0, INACTIVE: 0, SUSPENDED: 0 };
    for (const g of grouped) byStatus[g.status] = g._count._all;

    return { total, byStatus, newThisMonth };
  }

  // ============================================================
  // B03 — GET /dashboard/attendance
  // Serie de los últimos 7 días + total de hoy.
  // ============================================================
  async attendance(gymId: string) {
    const from = this.daysAgo(6); // hoy incluido = 7 días
    const to = this.startOfToday();

    const rows = await this.prisma.attendance.findMany({
      where: { gymId, checkedInAt: { gte: from } },
      select: { checkedInAt: true },
    });

    const series = this.bucketByDay(
      rows,
      (r) => r.checkedInAt,
      () => 1,
      from,
      to,
    );
    const todayKey = to.toISOString().slice(0, 10);

    return {
      total: rows.length,
      today: series.find((s) => s.date === todayKey)?.value ?? 0,
      series, // [{ date: '2026-09-04', value: 12 }, ...]
    };
  }

  // ============================================================
  // B04 — GET /dashboard/revenue  (INCOME del mes)
  // B05 — GET /dashboard/expenses (EXPENSE del mes)
  // Comparten lógica: total + serie diaria del mes en curso.
  // ============================================================
  private async txByType(gymId: string, type: TransactionType) {
    const from = this.startOfMonth();
    const to = this.startOfToday();

    const rows = await this.prisma.transaction.findMany({
      where: { gymId, type, date: { gte: from } },
      select: { amount: true, date: true },
    });

    const total = rows.reduce((acc, r) => acc + Number(r.amount), 0);
    const series = this.bucketByDay(
      rows,
      (r) => r.date,
      (r) => Number(r.amount),
      from,
      to,
    );

    return { total, count: rows.length, series };
  }

  revenue(gymId: string) {
    return this.txByType(gymId, TransactionType.INCOME);
  }

  expenses(gymId: string) {
    return this.txByType(gymId, TransactionType.EXPENSE);
  }

  // ============================================================
  // B06 — GET /dashboard/memberships
  // Vigentes / vencidas / por vencer (7 días) + reparto por plan.
  // ============================================================
  async memberships(gymId: string) {
    const now = new Date();
    const in7 = new Date(now);
    in7.setDate(in7.getDate() + 7);

    const [active, expired, expiringSoon, byPlan] = await Promise.all([
      this.prisma.membership.count({
        where: { gymId, status: 'active', endDate: { gte: now } },
      }),
      this.prisma.membership.count({
        where: { gymId, endDate: { lt: now } },
      }),
      this.prisma.membership.count({
        where: { gymId, status: 'active', endDate: { gte: now, lte: in7 } },
      }),
      this.prisma.membership.groupBy({
        by: ['planId'],
        where: { gymId, status: 'active', endDate: { gte: now } },
        _count: { _all: true },
      }),
    ]);

    // Resolvemos los nombres de plan (groupBy no permite include).
    const planIds = byPlan.map((p) => p.planId);
    const plans = await this.prisma.membershipPlan.findMany({
      where: { gymId, id: { in: planIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(plans.map((p) => [p.id, p.name]));

    return {
      active,
      expired,
      expiringSoon,
      byPlan: byPlan.map((p) => ({
        planId: p.planId,
        plan: nameById.get(p.planId) ?? 'Desconocido',
        count: p._count._all,
      })),
    };
  }

  // ============================================================
  // B07 — GET /dashboard/sales
  // Ventas del mes: total facturado, unidades y top productos.
  // ============================================================
  async sales(gymId: string) {
    const from = this.startOfMonth();

    const [agg, byProduct] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { gymId, soldAt: { gte: from } },
        _sum: { total: true, quantity: true },
        _count: { _all: true },
      }),
      this.prisma.sale.groupBy({
        by: ['productId'],
        where: { gymId, soldAt: { gte: from } },
        _sum: { total: true, quantity: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
    ]);

    const productIds = byProduct.map((p) => p.productId);
    const products = await this.prisma.product.findMany({
      where: { gymId, id: { in: productIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(products.map((p) => [p.id, p.name]));

    return {
      totalRevenue: Number(agg._sum.total ?? 0),
      unitsSold: agg._sum.quantity ?? 0,
      saleCount: agg._count._all,
      topProducts: byProduct.map((p) => ({
        productId: p.productId,
        product: nameById.get(p.productId) ?? 'Desconocido',
        revenue: Number(p._sum.total ?? 0),
        units: p._sum.quantity ?? 0,
      })),
    };
  }
}