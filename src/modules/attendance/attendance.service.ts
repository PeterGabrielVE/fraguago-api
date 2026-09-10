import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";
import { AttendanceShift } from "@prisma/client";

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  // Bloque de datos del socio reutilizado en los listados.
  private readonly memberInclude = {
    member: {
      select: {
        id: true,
        user: {
          select: {
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    },
  } as const;

  // Inicio del día de hoy (00:00 local).
  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Deriva el turno de la hora real, en vez de fijarlo a MORNING.
  private shiftFromHour(d: Date): AttendanceShift {
    const h = d.getHours();
    if (h < 12) return "MORNING";
    if (h < 18) return "AFTERNOON";
    return "NIGHT";
  }

  // B02 + F03 — el check-in valida que el socio tenga membresía vigente hoy.
  async checkIn(gymId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
    });
    if (!member) throw new NotFoundException("Member not found");

    const now = new Date();
    const activeMembership = await this.prisma.membership.findFirst({
      where: {
        gymId,
        memberId,
        status: "active",
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
    if (!activeMembership) {
      throw new ForbiddenException(
        "El socio no tiene una membresía vigente. No se permite el acceso.",
      );
    }

    return this.prisma.attendance.create({
      data: { gymId, memberId, shift: this.shiftFromHour(now) },
    });
  }

  // B01 — GET /attendance (listado general paginado).
  async findAll(gymId: string, page = 1, pageSize = 20) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        orderBy: { checkedInAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.memberInclude,
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // B03 — check-ins de hoy para el gym.
  today(gymId: string) {
    return this.prisma.attendance.findMany({
      where: { gymId, checkedInAt: { gte: this.startOfToday() } },
      orderBy: { checkedInAt: "desc" },
      include: this.memberInclude,
    });
  }

  // B04 — historial de asistencias de un socio (últimas 100).
  ofMember(gymId: string, memberId: string) {
    return this.prisma.attendance.findMany({
      where: { gymId, memberId },
      orderBy: { checkedInAt: "desc" },
      take: 100,
    });
  }

  // B05 — GET /attendance/summary. Conteo de hoy agrupado por turno.
  async summary(gymId: string) {
    const start = this.startOfToday();

    const grouped = await this.prisma.attendance.groupBy({
      by: ["shift"],
      where: { gymId, checkedInAt: { gte: start } },
      _count: { _all: true },
    });

    const byShift = { MORNING: 0, AFTERNOON: 0, NIGHT: 0 };
    for (const g of grouped) byShift[g.shift] = g._count._all;

    return {
      date: start,
      total: byShift.MORNING + byShift.AFTERNOON + byShift.NIGHT,
      byShift,
    };
  }
}