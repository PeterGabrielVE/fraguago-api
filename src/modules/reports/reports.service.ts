import { Inject, Injectable } from '@nestjs/common';
import { MemberStatus, MembershipStatus, TransactionType } from "@prisma/client";
import { ScopedPrismaClient, TENANT_PRISMA } from 'src/prisma/prisma.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { bucketKey, bucketKeys, localParts, parseRange } from './report-range';

const TOP_LIMIT = 10;
const DAY_MS = 86_400_000;

type Profile = { firstName?: string | null; lastName?: string | null } | null | undefined;

const fullName = (profile: Profile) => `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim();
// Las sumas de decimales en coma flotante arrastran residuos (0.1 + 0.2).
const round2 = (n: number) => Math.round(n * 100) / 100;

// Acumula total y cantidad por clave (concepto, método de pago, producto…).
class Tally<K> {
  private readonly map = new Map<K, { total: number; count: number }>();

  add(key: K, amount: number, count = 1) {
    const entry = this.map.get(key) ?? { total: 0, count: 0 };
    entry.total += amount;
    entry.count += count;
    this.map.set(key, entry);
  }

  // De mayor a menor total.
  entries() {
    return [...this.map.entries()]
      .map(([key, v]) => ({ key, total: round2(v.total), count: v.count }))
      .sort((a, b) => b.total - a.total);
  }
}

@Injectable()
export class ReportsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  // Dashboard: the key numbers a gym owner wants at a glance.
  async dashboard(gymId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const [members, activeMemberships, attendanceToday, monthTx] = await Promise.all([
      this.prisma.member.count({ where: { gymId, status: MemberStatus.ACTIVE } }),
      // Membership.status es un String ("active"), NO el enum MemberStatus.
      this.prisma.membership.count({ where: { gymId, status: MembershipStatus.ACTIVE, endDate: { gte: now } } }),
      this.prisma.attendance.count({ where: { gymId, checkedInAt: { gte: startOfDay } } }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { gymId, date: { gte: startOfMonth } },
        // amountBase: todo ya convertido a la moneda base del gym; sumar
        // "amount" crudo mezclaría USD/VES/EUR sin sentido.
        _sum: { amountBase: true },
      }),
    ]);

    const income = Number(monthTx.find((t) => t.type === 'INCOME')?._sum.amountBase ?? 0);
    const expense = Number(monthTx.find((t) => t.type === 'EXPENSE')?._sum.amountBase ?? 0);

    return {
      activeMembers: members,
      activeMemberships,
      attendanceToday,
      month: { income, expense, balance: income - expense },
    };
  }

  private async baseCurrency(gymId: string) {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId }, select: { baseCurrency: true } });
    return gym?.baseCurrency ?? 'USD';
  }

  // ============================================================
  // GET /reports/finances
  // Ingresos, egresos y balance del rango (en la moneda base del gym), frente
  // al periodo anterior, con su serie y el reparto por concepto y método de pago.
  // ============================================================
  async finances(gymId: string, query: ReportQueryDto) {
    const range = parseRange(query.from, query.to);

    const [rows, prev, currency] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { gymId, date: { gte: range.start, lt: range.end } },
        select: {
          type: true,
          amountBase: true,
          date: true,
          paymentMethod: true,
          conceptId: true,
          concept: { select: { name: true } },
        },
      }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { gymId, date: { gte: range.prevStart, lt: range.prevEnd } },
        _sum: { amountBase: true },
      }),
      this.baseCurrency(gymId),
    ]);

    const series = new Map(bucketKeys(range).map((key) => [key, { income: 0, expense: 0 }]));
    const conceptNames = new Map<string | null, string | null>();
    const incomeByConcept = new Tally<string | null>();
    const expenseByConcept = new Tally<string | null>();
    const byPaymentMethod = new Tally<string | null>();
    let income = 0;
    let expense = 0;

    for (const row of rows) {
      const amount = Number(row.amountBase);
      const bucket = series.get(bucketKey(row.date, range.granularity));
      conceptNames.set(row.conceptId, row.concept?.name ?? null);
      if (row.type === TransactionType.INCOME) {
        income += amount;
        if (bucket) bucket.income += amount;
        incomeByConcept.add(row.conceptId, amount);
        byPaymentMethod.add(row.paymentMethod, amount);
      } else {
        expense += amount;
        if (bucket) bucket.expense += amount;
        expenseByConcept.add(row.conceptId, amount);
      }
    }

    const prevIncome = Number(prev.find((p) => p.type === TransactionType.INCOME)?._sum.amountBase ?? 0);
    const prevExpense = Number(prev.find((p) => p.type === TransactionType.EXPENSE)?._sum.amountBase ?? 0);
    // concept: null = movimiento sin concepto asignado.
    const withConcept = (tally: Tally<string | null>) =>
      tally.entries().map((e) => ({ concept: conceptNames.get(e.key) ?? null, total: e.total, count: e.count }));

    return {
      range: { from: range.from, to: range.to, days: range.days },
      granularity: range.granularity,
      currency,
      totals: { income: round2(income), expense: round2(expense), balance: round2(income - expense), count: rows.length },
      previous: { income: prevIncome, expense: prevExpense, balance: round2(prevIncome - prevExpense) },
      series: [...series.entries()].map(([date, v]) => ({ date, income: round2(v.income), expense: round2(v.expense) })),
      incomeByConcept: withConcept(incomeByConcept),
      expenseByConcept: withConcept(expenseByConcept),
      // method: null = ingreso sin método de pago registrado.
      byPaymentMethod: byPaymentMethod.entries().map((e) => ({ method: e.key, total: e.total, count: e.count })),
    };
  }

  // ============================================================
  // GET /reports/members
  // Altas, membresías iniciadas y renovación de las que vencieron en el
  // rango, más la foto actual de la base de socios.
  // ============================================================
  async members(gymId: string, query: ReportQueryDto) {
    const range = parseRange(query.from, query.to);
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * DAY_MS);
    // Una membresía que vence mañana todavía no "venció": no cuenta para la renovación.
    const expiredUntil = range.end < now ? range.end : now;
    const notCancelled = { not: MembershipStatus.CANCELLED };

    const [joined, prevJoined, started, prevStarted, expired, byStatus, activeMemberships, expiringSoon] =
      await Promise.all([
        this.prisma.member.findMany({
          where: { gymId, joinedAt: { gte: range.start, lt: range.end } },
          select: { joinedAt: true },
        }),
        this.prisma.member.count({ where: { gymId, joinedAt: { gte: range.prevStart, lt: range.prevEnd } } }),
        this.prisma.membership.findMany({
          where: { gymId, status: notCancelled, startDate: { gte: range.start, lt: range.end } },
          select: { planId: true, plan: { select: { name: true } } },
        }),
        this.prisma.membership.count({
          where: { gymId, status: notCancelled, startDate: { gte: range.prevStart, lt: range.prevEnd } },
        }),
        this.prisma.membership.findMany({
          where: { gymId, status: notCancelled, endDate: { gte: range.start, lt: expiredUntil } },
          orderBy: { endDate: 'desc' },
          select: {
            memberId: true,
            endDate: true,
            plan: { select: { name: true } },
            member: { select: { user: { select: { profile: { select: { firstName: true, lastName: true } } } } } },
          },
        }),
        this.prisma.member.groupBy({ by: ['status'], where: { gymId }, _count: { _all: true } }),
        this.prisma.membership.count({
          where: { gymId, status: MembershipStatus.ACTIVE, startDate: { lte: now }, endDate: { gte: now } },
        }),
        this.prisma.membership.count({
          where: { gymId, status: MembershipStatus.ACTIVE, startDate: { lte: now }, endDate: { gte: now, lte: in7Days } },
        }),
      ]);

    const series = new Map(bucketKeys(range).map((key) => [key, 0]));
    for (const member of joined) {
      const key = bucketKey(member.joinedAt, range.granularity);
      if (series.has(key)) series.set(key, series.get(key)! + 1);
    }

    const planNames = new Map<string, string>();
    const byPlan = new Tally<string>();
    for (const membership of started) {
      planNames.set(membership.planId, membership.plan.name);
      byPlan.add(membership.planId, 1);
    }

    // Renovación: por socio se mira su última membresía vencida en el rango
    // (vienen ordenadas por endDate desc) y si tiene otra que termine después.
    const lastExpired = new Map<string, (typeof expired)[number]>();
    for (const membership of expired) {
      if (!lastExpired.has(membership.memberId)) lastExpired.set(membership.memberId, membership);
    }
    const others = lastExpired.size
      ? await this.prisma.membership.findMany({
          where: { gymId, status: notCancelled, memberId: { in: [...lastExpired.keys()] } },
          select: { memberId: true, endDate: true },
        })
      : [];
    const latestEnd = new Map<string, Date>();
    for (const membership of others) {
      const current = latestEnd.get(membership.memberId);
      if (!current || membership.endDate > current) latestEnd.set(membership.memberId, membership.endDate);
    }
    const lapsed = [...lastExpired.values()].filter((m) => latestEnd.get(m.memberId)! <= m.endDate);

    const status = { ACTIVE: 0, INACTIVE: 0, SUSPENDED: 0 };
    for (const group of byStatus) status[group.status] = group._count._all;

    return {
      range: { from: range.from, to: range.to, days: range.days },
      granularity: range.granularity,
      newMembers: { total: joined.length, previous: prevJoined },
      membershipsStarted: { total: started.length, previous: prevStarted },
      series: [...series.entries()].map(([date, value]) => ({ date, value })),
      byPlan: byPlan.entries().map((e) => ({ plan: planNames.get(e.key) ?? '', count: e.count })),
      renewal: {
        expired: lastExpired.size,
        renewed: lastExpired.size - lapsed.length,
        lapsed: lapsed.length,
        // Los vencimientos más recientes sin renovar: a quién conviene contactar.
        lapsedMembers: lapsed.slice(0, TOP_LIMIT).map((m) => ({
          memberId: m.memberId,
          name: fullName(m.member.user.profile),
          plan: m.plan.name,
          endDate: m.endDate,
        })),
      },
      current: {
        total: status.ACTIVE + status.INACTIVE + status.SUSPENDED,
        byStatus: status,
        activeMemberships,
        expiringSoon,
      },
    };
  }

  // ============================================================
  // GET /reports/attendance
  // Visitas del rango frente al periodo anterior, su serie, el mapa de calor
  // día de la semana × hora, el reparto por turno y los socios más constantes.
  // ============================================================
  async attendance(gymId: string, query: ReportQueryDto) {
    const range = parseRange(query.from, query.to);
    const prevWhere = { gymId, checkedInAt: { gte: range.prevStart, lt: range.prevEnd } };

    const [rows, prevTotal, prevMembers] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { gymId, checkedInAt: { gte: range.start, lt: range.end } },
        select: { checkedInAt: true, memberId: true, shift: true },
      }),
      this.prisma.attendance.count({ where: prevWhere }),
      this.prisma.attendance.groupBy({ by: ['memberId'], where: prevWhere }),
    ]);

    const series = new Map(bucketKeys(range).map((key) => [key, 0]));
    // heatmap[díaSemana 0=domingo][hora 0-23] = visitas.
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    const byShift = { MORNING: 0, AFTERNOON: 0, NIGHT: 0 };
    const visits = new Tally<string>();

    for (const row of rows) {
      const { hour, weekday } = localParts(row.checkedInAt);
      const key = bucketKey(row.checkedInAt, range.granularity);
      if (series.has(key)) series.set(key, series.get(key)! + 1);
      heatmap[weekday][hour] += 1;
      byShift[row.shift] += 1;
      visits.add(row.memberId, 1);
    }

    const ranked = visits.entries();
    const top = ranked.slice(0, TOP_LIMIT);
    const members = top.length
      ? await this.prisma.member.findMany({
          where: { gymId, id: { in: top.map((t) => t.key) } },
          select: { id: true, user: { select: { profile: { select: { firstName: true, lastName: true } } } } },
        })
      : [];
    const names = new Map(members.map((m) => [m.id, fullName(m.user.profile)]));

    return {
      range: { from: range.from, to: range.to, days: range.days },
      granularity: range.granularity,
      totals: { visits: rows.length, uniqueMembers: ranked.length },
      previous: { visits: prevTotal, uniqueMembers: prevMembers.length },
      series: [...series.entries()].map(([date, value]) => ({ date, value })),
      heatmap,
      byShift,
      topMembers: top.map((t) => ({ memberId: t.key, name: names.get(t.key) ?? '', visits: t.count })),
    };
  }

  // ============================================================
  // GET /reports/sales
  // Ventas del punto de venta en el rango, en la moneda base del gym.
  // ============================================================
  async sales(gymId: string, query: ReportQueryDto) {
    const range = parseRange(query.from, query.to);
    // Sale.total está en la moneda de la venta; el importe en moneda base es el
    // del ingreso que generó. Las ventas viejas quedaron con amountBase = 0 o
    // sin ingreso: ahí se toma el total tal cual.
    const baseAmount = (sale: { total: unknown; transaction: { amountBase: unknown } | null }) =>
      Number(sale.transaction?.amountBase ?? 0) || Number(sale.total);

    const [sales, prevSales, currency] = await Promise.all([
      this.prisma.sale.findMany({
        where: { gymId, soldAt: { gte: range.start, lt: range.end } },
        select: {
          soldAt: true,
          total: true,
          paymentMethod: true,
          transaction: { select: { amountBase: true } },
          items: { select: { productId: true, quantity: true, subtotal: true } },
        },
      }),
      this.prisma.sale.findMany({
        where: { gymId, soldAt: { gte: range.prevStart, lt: range.prevEnd } },
        select: { total: true, transaction: { select: { amountBase: true } } },
      }),
      this.baseCurrency(gymId),
    ]);

    const series = new Map(bucketKeys(range).map((key) => [key, 0]));
    const byProduct = new Tally<string>();
    const byPaymentMethod = new Tally<string | null>();
    let revenue = 0;
    let units = 0;

    for (const sale of sales) {
      const amount = baseAmount(sale);
      const total = Number(sale.total);
      revenue += amount;
      const key = bucketKey(sale.soldAt, range.granularity);
      if (series.has(key)) series.set(key, series.get(key)! + amount);
      byPaymentMethod.add(sale.paymentMethod, amount);
      for (const item of sale.items) {
        units += item.quantity;
        // Cada renglón se lleva a moneda base en la proporción que pesa en su venta.
        byProduct.add(item.productId, total > 0 ? (Number(item.subtotal) / total) * amount : 0, item.quantity);
      }
    }

    const top = byProduct.entries().slice(0, TOP_LIMIT);
    const products = top.length
      ? await this.prisma.product.findMany({
          where: { gymId, id: { in: top.map((t) => t.key) } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(products.map((p) => [p.id, p.name]));

    return {
      range: { from: range.from, to: range.to, days: range.days },
      granularity: range.granularity,
      currency,
      totals: { revenue: round2(revenue), count: sales.length, units },
      previous: { revenue: round2(prevSales.reduce((sum, s) => sum + baseAmount(s), 0)), count: prevSales.length },
      series: [...series.entries()].map(([date, value]) => ({ date, value: round2(value) })),
      topProducts: top.map((t) => ({ productId: t.key, product: names.get(t.key) ?? '', revenue: t.total, units: t.count })),
      byPaymentMethod: byPaymentMethod.entries().map((e) => ({ method: e.key, total: e.total, count: e.count })),
    };
  }
}
