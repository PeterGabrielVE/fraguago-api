import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";
import { AttendanceShift, KioskEntryStatus, Prisma, MembershipStatus } from "@prisma/client";
import { GamificationService } from "../gamification/gamification.service";
import { ATTENDANCE_METRICS, ChallengesService } from "../challenges/challenges.service";
import { OccupancyEventsService } from "./occupancy-events.service";
import { tenantContext } from "../../common/tenant/tenant.context";
import { findPublicGym } from "../../common/public-gym";
import { SyncRejection } from "../sync/sync-rejection";

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

  // Check-in que llega por la cola de sincronización (POST /sync/operations).
  // `id` lo generó el cliente: si la entrada ya existe, la operación ya se
  // aplicó (reintento) y se devuelve tal cual. `live` = se marcó hace
  // instantes, con conexión: aplica el aforo como el check-in normal. Una
  // entrada diferida ya ocurrió, así que no se rechaza por aforo; y si otro
  // dispositivo ya registró esa misma visita se reutiliza en vez de duplicarla.
  async syncCheckIn(
    gymId: string,
    input: { id: string; memberId: string; occurredAt: Date; live: boolean },
  ) {
    const { id, memberId, occurredAt, live } = input;

    const existing = await this.prisma.attendance.findFirst({
      where: { id, gymId },
      include: this.memberInclude,
    });
    if (existing) return { attendance: existing, merged: false };

    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
      select: { id: true },
    });
    if (!member) {
      throw new SyncRejection("MEMBER_NOT_FOUND", "El socio ya no existe en este gimnasio.");
    }

    // Misma regla que checkIn, evaluada en el momento real de la entrada.
    const activeMembership = await this.prisma.membership.findFirst({
      where: {
        gymId,
        memberId,
        status: MembershipStatus.ACTIVE,
        startDate: { lte: occurredAt },
        endDate: { gte: occurredAt },
      },
      select: { id: true },
    });
    if (!activeMembership) {
      throw new SyncRejection(
        "NO_ACTIVE_MEMBERSHIP",
        "El socio no tenía una membresía vigente en el momento de la entrada.",
      );
    }

    if (live) {
      const occupancy = await this.occupancyCore(gymId, occurredAt);
      if (occupancy.status === "FULL" && !occupancy.memberIds.includes(memberId)) {
        throw new SyncRejection(
          "CAPACITY_FULL",
          `Aforo completo (${occupancy.current}/${occupancy.capacity}). Espera a que salga alguien.`,
        );
      }
    } else {
      const nearby = await this.prisma.attendance.findFirst({
        where: {
          gymId,
          memberId,
          checkedInAt: {
            gte: new Date(occurredAt.getTime() - PUBLIC_DUPLICATE_WINDOW_MS),
            lte: new Date(occurredAt.getTime() + PUBLIC_DUPLICATE_WINDOW_MS),
          },
        },
        orderBy: { checkedInAt: "desc" },
        include: this.memberInclude,
      });
      if (nearby) return { attendance: nearby, merged: true };
    }

    let attendance;
    try {
      attendance = await this.prisma.attendance.create({
        data: {
          id,
          gymId,
          memberId,
          checkedInAt: occurredAt,
          shift: this.shiftFromHour(occurredAt),
        },
        include: this.memberInclude,
      });
    } catch (err) {
      // La misma operación llegó dos veces a la vez: la otra ya la creó.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const created = await this.prisma.attendance.findFirst({
          where: { id, gymId },
          include: this.memberInclude,
        });
        if (created) return { attendance: created, merged: false };
      }
      throw err;
    }
    this.occupancyEvents.emit(gymId);

    await this.gamification.onCheckIn(gymId, memberId, attendance.id, occurredAt);
    await this.challenges.onActivity(gymId, memberId, ATTENDANCE_METRICS);
    return { attendance, merged: false };
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

  // Gym de la URL pública (slug o id) → id real, para abrir el contexto.
  resolvePublicGym(ref: string) {
    return findPublicGym(this.prisma, ref);
  }

  // GET /public/attendance/:slug — solo el nombre, para el encabezado.
  async publicGym(ref: string) {
    const { name, slug } = await findPublicGym(this.prisma, ref);
    return { name, slug };
  }

  // POST /public/attendance/:slug/check-in (el controlador ya resolvió el id) — el socio marca su entrada con
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

  // --- Kiosko sin conexión ---

  // Antigüedad máxima de una entrada del kiosko (SYNC_KIOSK_MAX_AGE_HOURS, 48
  // por defecto). Más corta que la del panel: aquí no hay sesión que responda.
  private kioskMaxAgeMs() {
    const hours = Number(process.env.SYNC_KIOSK_MAX_AGE_HOURS);
    return (Number.isFinite(hours) && hours > 0 ? hours : 48) * 3_600_000;
  }

  // POST /public/attendance/:slug/sync-check-in — entradas que el kiosko guardó
  // sin internet. Se validan aquí, al recibirlas; las rechazadas quedan en
  // KioskEntry para recepción. La respuesta no dice qué pasó con cada una: el
  // endpoint es público y no debe servir para probar qué cédulas existen.
  publicSyncCheckIns(
    gymId: string,
    sentAt: string,
    entries: { id: string; identificationNumber: string; createdAt: string }[],
  ) {
    return tenantContext.run({ gymId }, async () => {
      const sent = new Date(sentAt).getTime();
      for (const entry of entries) {
        const known = await this.prisma.kioskEntry.findUnique({
          where: { gymId_id: { gymId, id: entry.id } },
          select: { id: true },
        });
        if (known) continue; // reenvío: ya se procesó

        const elapsed = Math.max(0, sent - new Date(entry.createdAt).getTime());
        const occurredAt = new Date(Date.now() - elapsed);
        const outcome = await this.applyKioskEntry(gymId, entry, occurredAt, elapsed);

        try {
          await this.prisma.kioskEntry.create({
            data: {
              gymId,
              id: entry.id,
              identificationNumber: entry.identificationNumber,
              occurredAt,
              ...outcome,
            },
          });
        } catch (err) {
          // El mismo lote llegó dos veces a la vez: el otro ya la registró.
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
        }
      }
      return { received: entries.length };
    });
  }

  private async applyKioskEntry(
    gymId: string,
    entry: { id: string; identificationNumber: string },
    occurredAt: Date,
    elapsed: number,
  ): Promise<{ status: KioskEntryStatus; reason?: string; attendanceId?: string }> {
    if (elapsed > this.kioskMaxAgeMs()) return { status: "REJECTED", reason: "TOO_OLD" };

    const member = await this.prisma.member.findFirst({
      where: { gymId, identificationNumber: entry.identificationNumber },
      select: { id: true },
    });
    if (!member) return { status: "REJECTED", reason: "MEMBER_NOT_FOUND" };

    try {
      // Siempre diferida: ya ocurrió, no se rechaza por aforo, y si recepción
      // ya marcó esa visita se reutiliza en vez de duplicarla.
      const { attendance } = await this.syncCheckIn(gymId, {
        id: entry.id,
        memberId: member.id,
        occurredAt,
        live: false,
      });
      return { status: "APPLIED", attendanceId: attendance.id };
    } catch (err) {
      if (err instanceof SyncRejection) return { status: "REJECTED", reason: err.code };
      throw err;
    }
  }

  // GET /attendance/kiosk-rejections — entradas del kiosko que no se pudieron
  // confirmar y recepción aún no revisó, con el nombre del socio si existe.
  async kioskRejections(gymId: string) {
    const entries = await this.prisma.kioskEntry.findMany({
      where: { gymId, status: "REJECTED", dismissedAt: null },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
    if (entries.length === 0) return [];

    const members = await this.prisma.member.findMany({
      where: { gymId, identificationNumber: { in: entries.map((e) => e.identificationNumber) } },
      select: {
        id: true,
        identificationNumber: true,
        user: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    const byId = new Map(members.map((m) => [m.identificationNumber, m]));

    return entries.map((entry) => {
      const member = byId.get(entry.identificationNumber);
      const profile = member?.user?.profile;
      return {
        id: entry.id,
        identificationNumber: entry.identificationNumber,
        occurredAt: entry.occurredAt,
        reason: entry.reason,
        memberId: member?.id ?? null,
        memberName: profile ? `${profile.firstName} ${profile.lastName}`.trim() : null,
      };
    });
  }

  // POST /attendance/kiosk-rejections/:id/dismiss — recepción la da por revisada.
  async dismissKioskRejection(gymId: string, id: string) {
    const { count } = await this.prisma.kioskEntry.updateMany({
      where: { gymId, id, status: "REJECTED", dismissedAt: null },
      data: { dismissedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException("Entrada no encontrada");
    return { id, dismissed: true };
  }
}
