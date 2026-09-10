// modules/memberships/memberships.service.ts
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";
import { PaginationDto } from "src/common/dto/pagination.dto";
import { paginate } from "src/common/pagination";

@Injectable()
export class MembershipsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  // única fuente de verdad para la fecha de vencimiento.
  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  // Bloque de datos del miembro reutilizado en varios listados.
  private readonly memberInclude = {
    member: {
      select: {
        user: {
          select: {
            email: true,
            profile: {
              select: { firstName: true, lastName: true, phone: true },
            },
          },
        },
      },
    },
  } as const;

  // assign. endDate = start + plan.durationDays.
  async assign(
    gymId: string,
    input: { memberId: string; planId: string; startDate?: string },
  ) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: input.planId, gymId },
    });
    if (!plan) throw new NotFoundException("Plan not found");

    const start = input.startDate ? new Date(input.startDate) : new Date();
    return this.prisma.membership.create({
      data: {
        gymId,
        memberId: input.memberId,
        planId: plan.id,
        startDate: start,
        endDate: this.addDays(start, plan.durationDays),
      },
    });
  }

  async findAll(gymId: string, query: PaginationDto) {
    const { page = 1, pageSize = 20 } = query;

    const where = {
      gymId,
    };

    return paginate(this.prisma.membership, {
      where,
      orderBy: { endDate: "desc" },
      include: {
        ...this.memberInclude,
        plan: { select: { name: true } },
      },
      page,
      pageSize,
    });
  }

  async findByMember(gymId: string, memberId: string, query: PaginationDto) {
    const { page = 1, pageSize = 20 } = query;

    const where = {
      gymId,
      memberId,
    };

    return paginate(this.prisma.membership, {
      where,
      orderBy: { endDate: "desc" },
      include: { plan: { select: { name: true, type: true, price: true } } },
      page,
      pageSize,
    });
  }

  async renew(
    gymId: string,
    id: string,
    input: { startDate?: string; planId?: string } = {},
  ) {
    const current = await this.prisma.membership.findFirst({
      where: { id, gymId },
    });
    if (!current) throw new NotFoundException("Membership not found");

    // Permite renovar con el mismo plan o cambiarlo.
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: input.planId ?? current.planId, gymId },
    });
    if (!plan) throw new NotFoundException("Plan not found");

    // Renueva ANTES de vencer -> encadena desde endDate (no pierde días).
    // Ya vencida -> arranca desde hoy (o desde startDate si lo mandan).
    const now = new Date();
    const base = input.startDate
      ? new Date(input.startDate)
      : current.endDate > now
        ? current.endDate
        : now;

    return this.prisma.membership.update({
      where: { id: current.id },
      data: {
        planId: plan.id,
        startDate: base,
        endDate: this.addDays(base, plan.durationDays),
        status: "active",
      },
    });
  }

  // Piso `gte: now` para no solaparse con las ya vencidas (B05).
  async expiring(
    gymId: string,
    days = 7,
    page = 1,
    pageSize = 20,
  ) {
    const now = new Date();
    const limit = this.addDays(now, days);

    const where = {
      gymId,
      status: "active",
      endDate: { gte: now, lte: limit },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        orderBy: { endDate: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...this.memberInclude,
          plan: { select: { name: true } },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // Filtra por fecha, no por status: nada marca "expired" automáticamente todavía.
  async expired(gymId: string, page = 1, pageSize = 20) {
    const where = {
      gymId,
      endDate: { lt: new Date() },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        orderBy: { endDate: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          ...this.memberInclude,
          plan: { select: { name: true } },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
