import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";
import { AttendanceShift, Prisma, MembershipStatus } from "@prisma/client";
import { GamificationService } from "../gamification/gamification.service";
import { ATTENDANCE_METRICS, ChallengesService } from "../challenges/challenges.service";
import { OccupancyEventsService } from "./occupancy-events.service";
import { tenantContext } from "../../common/tenant/tenant.context";

// Desde este porcentaje del aforo se considera "concurrido".
const BUSY_THRESHOLD = 0.7;

// En la pantalla pública, un segundo check-in dentro de esta ventana se toma
// como el mismo (doble toque) y no crea otra entrada.
const PUBLIC_DUPLICATE_WINDOW_MS = 10 * 60_000;

export type OccupancyStatus = "UNLIMITED" | "AVAILABLE" | "BUSY" | "FULL";

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly gamification: GamificationService,
    private readonly challenges: ChallengesService,
    private readonly occupancyEvents: OccupancyEventsService,
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

  // Medianoche local de una fecha "YYYY-MM-DD" (evita el corrimiento de día
  // que da `new Date('YYYY-MM-DD')`, que Node interpreta como UTC).
  private startOfDay(dateStr: string): Date {
    const [year, month, day] = dateStr.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0);
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
        status: MembershipStatus.ACTIVE,
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });
    if (!activeMembership) {
      // 400, no 403: esto es una regla de negocio (el socio, no quien marca
      // la entrada), no un problema de permisos del usuario logueado. Un 403
      // acá dispara la redirección genérica de "sin permisos" en el frontend.
      throw new BadRequestException(
        "El socio no tiene una membresía vigente hoy. No se permite el acceso.",
      );
    }

    // Aforo: si está lleno no entra nadie nuevo. Quien ya figura dentro
    // (entrada abierta) puede volver a marcar sin contar doble.
    const occupancy = await this.occupancyCore(gymId, now);
    if (occupancy.status === "FULL" && !occupancy.memberIds.includes(memberId)) {
      throw new ConflictException(
        `Aforo completo (${occupancy.current}/${occupancy.capacity}). Espera a que salga alguien.`,
      );
    }

    const attendance = await this.prisma.attendance.create({
      data: { gymId, memberId, shift: this.shiftFromHour(now) },
    });
    this.occupancyEvents.emit(gymId);

    // GAM-B02 — puntos por asistencia + insignias desbloqueadas. Nunca rompe
    // el check-in (onCheckIn captura sus propios errores).
    const gamification = await this.gamification.onCheckIn(gymId, memberId, attendance.id);
    // COM-B03 — progreso de retos de asistencia en curso (tampoco rompe).
    const challenges = await this.challenges.onActivity(gymId, memberId, ATTENDANCE_METRICS);
    return { ...attendance, gamification, challenges };
  }

  // B01 — GET /attendance (listado general paginado, opcionalmente filtrado
  // por fecha exacta y/o turno).
  async findAll(
    gymId: string,
    page = 1,
    pageSize = 20,
    date?: string,
    shift?: AttendanceShift,
  ) {
    const where: Prisma.AttendanceWhereInput = { gymId };
    if (date) {
      const start = this.startOfDay(date);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.checkedInAt = { gte: start, lt: end };
    }
    if (shift) where.shift = shift;

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

  // --- Aforo en tiempo real ---

  // Una entrada está "abierta" si no tiene salida y aún no pasó la duración
  // promedio de visita: así el aforo se libera solo aunque nadie marque salida.
  private openWhere(gymId: string, now: Date, avgVisitMinutes: number): Prisma.AttendanceWhereInput {
    return {
      gymId,
      checkedOutAt: null,
      checkedInAt: { gte: new Date(now.getTime() - avgVisitMinutes * 60_000), lte: now },
    };
  }

  private async occupancyCore(gymId: string, now = new Date()) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      select: { maxCapacity: true, avgVisitMinutes: true },
    });
    if (!gym) throw new NotFoundException("Gimnasio no encontrado");

    // Un socio cuenta una sola vez aunque tenga varias entradas abiertas.
    const open = await this.prisma.attendance.findMany({
      where: this.openWhere(gymId, now, gym.avgVisitMinutes),
      select: { memberId: true },
      distinct: ["memberId"],
    });
    const current = open.length;
    const capacity = gym.maxCapacity && gym.maxCapacity > 0 ? gym.maxCapacity : null;

    let status: OccupancyStatus = "UNLIMITED";
    if (capacity) {
      status = current >= capacity ? "FULL" : current >= capacity * BUSY_THRESHOLD ? "BUSY" : "AVAILABLE";
    }

    return {
      current,
      capacity,
      available: capacity ? Math.max(0, capacity - current) : null,
      percentage: capacity ? Math.min(100, Math.round((current / capacity) * 100)) : null,
      status,
      avgVisitMinutes: gym.avgVisitMinutes,
      updatedAt: now,
      memberIds: open.map((a) => a.memberId),
    };
  }

  // GET /me/occupancy — vista del socio: solo números, sin quién está dentro.
  async occupancy(gymId: string) {
    const { memberIds: _memberIds, ...summary } = await this.occupancyCore(gymId);
    return summary;
  }

  // GET /attendance/occupancy — vista del staff: incluye quién está dentro.
  async occupancyDetail(gymId: string) {
    const now = new Date();
    const { memberIds: _memberIds, ...summary } = await this.occupancyCore(gymId, now);
    const openEntries = await this.prisma.attendance.findMany({
      where: this.openWhere(gymId, now, summary.avgVisitMinutes),
      orderBy: { checkedInAt: "desc" },
      include: this.memberInclude,
    });
    // Una fila por socio (la entrada más reciente).
    const seen = new Set<string>();
    const inside = openEntries.filter((a) => !seen.has(a.memberId) && seen.add(a.memberId));
    return { ...summary, inside };
  }

  // POST /attendance/:id/check-out — cierra una entrada (y cualquier otra
  // entrada abierta del mismo socio, para que deje de contar en el aforo).
  async checkOut(gymId: string, attendanceId: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: { id: attendanceId, gymId },
    });
    if (!attendance) throw new NotFoundException("Asistencia no encontrada");
    if (attendance.checkedOutAt) {
      throw new BadRequestException("Esta entrada ya tiene la salida registrada.");
    }
    return this.checkOutMember(gymId, attendance.memberId);
  }

  // Marca la salida de todas las entradas abiertas del socio.
  async checkOutMember(gymId: string, memberId: string) {
    const now = new Date();
    const { count } = await this.prisma.attendance.updateMany({
      where: { gymId, memberId, checkedOutAt: null, checkedInAt: { gte: this.startOfToday(), lte: now } },
      data: { checkedOutAt: now },
    });
    if (count === 0) {
      throw new BadRequestException("El socio no tiene una entrada abierta hoy.");
    }
    this.occupancyEvents.emit(gymId);
    return { checkedOutAt: now, closed: count };
  }

  occupancyStream(gymId: string) {
    return this.occupancyEvents.stream(gymId);
  }

  // --- Pantalla pública de asistencia (sin sesión) ---
  //
  // Una ruta pública no trae JWT, así que el TenantInterceptor no abre
  // contexto y RLS devolvería 0 filas. Abrimos el contexto con el gymId de la
  // URL: RLS sigue limitando todo a ese gym.

  // GET /public/attendance/:gymId — solo el nombre, para el encabezado.
  publicGym(gymId: string) {
    return tenantContext.run({ gymId }, async () => {
      const gym = await this.prisma.gym.findUnique({
        where: { id: gymId },
        select: { name: true },
      });
      if (!gym) throw new NotFoundException("Gimnasio no encontrado");
      return gym;
    });
  }

  // POST /public/attendance/:gymId/check-in — el socio marca su entrada con
  // su número de identificación. Devuelve lo mínimo (nombre de pila) para no
  // exponer datos del socio a quien pruebe números al azar.
  publicCheckIn(gymId: string, identificationNumber: string) {
    return tenantContext.run({ gymId }, async () => {
      const member = await this.prisma.member.findFirst({
        where: { gymId, identificationNumber },
        select: {
          id: true,
          user: { select: { profile: { select: { firstName: true } } } },
        },
      });
      if (!member) {
        throw new NotFoundException(
          "No encontramos un socio con ese número de identificación.",
        );
      }
      const firstName = member.user?.profile?.firstName ?? null;

      // Evita duplicar la entrada por un doble toque en el kiosko.
      const recent = await this.prisma.attendance.findFirst({
        where: {
          gymId,
          memberId: member.id,
          checkedOutAt: null,
          checkedInAt: { gte: new Date(Date.now() - PUBLIC_DUPLICATE_WINDOW_MS) },
        },
        orderBy: { checkedInAt: "desc" },
      });
      if (recent) {
        return {
          firstName,
          checkedInAt: recent.checkedInAt,
          alreadyCheckedIn: true,
          pointsAwarded: 0,
        };
      }

      const attendance = await this.checkIn(gymId, member.id);
      return {
        firstName,
        checkedInAt: attendance.checkedInAt,
        alreadyCheckedIn: false,
        pointsAwarded: attendance.gamification.pointsAwarded,
      };
    });
  }
}
