import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BadgeCriteria, PointsSource, Prisma } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { CreateBadgeDto } from './dto/create-badge.dto';
import { UpdateBadgeDto } from './dto/update-badge.dto';

// Cliente dentro de un $transaction interactivo del cliente tenant.
export type GamificationTx = Parameters<
  Parameters<ScopedPrismaClient['$transaction']>[0] extends infer F
    ? F extends (tx: any) => any
      ? F
      : never
    : never
>[0];

// Puntos por el primer check-in del día (los siguientes del mismo día no suman,
// así el auto check-in del portal no se puede "farmear").
export const ATTENDANCE_POINTS = 10;

// Niveles por defecto cuando el gym no configuró los suyos.
export const DEFAULT_TIERS = [
  { name: 'Bronce', minPoints: 0, color: '#CD7F32', benefits: null },
  { name: 'Plata', minPoints: 500, color: '#A8A9AD', benefits: null },
  { name: 'Oro', minPoints: 1500, color: '#D4AF37', benefits: null },
  { name: 'Platino', minPoints: 3000, color: '#5B8FA8', benefits: null },
] as const;

// Set inicial de insignias que el staff puede crear con un clic.
const DEFAULT_BADGES: Omit<Prisma.BadgeCreateManyInput, 'gymId'>[] = [
  { name: 'Primer paso', description: 'Tu primera asistencia al gym', icon: 'footprints', criteria: 'ATTENDANCE_COUNT', threshold: 1, pointsReward: 20 },
  { name: 'Constante', description: '10 asistencias registradas', icon: 'flame', criteria: 'ATTENDANCE_COUNT', threshold: 10, pointsReward: 50 },
  { name: 'Imparable', description: '50 asistencias registradas', icon: 'zap', criteria: 'ATTENDANCE_COUNT', threshold: 50, pointsReward: 150 },
  { name: 'Leyenda del gym', description: '100 asistencias registradas', icon: 'crown', criteria: 'ATTENDANCE_COUNT', threshold: 100, pointsReward: 300 },
  { name: 'Coleccionista', description: 'Acumula 1000 puntos', icon: 'trophy', criteria: 'LIFETIME_POINTS', threshold: 1000, pointsReward: 100 },
];

export type TierInfo = {
  id: string | null;
  name: string;
  minPoints: number;
  color: string | null;
  benefits: string | null;
};

type ApplyPointsOptions = {
  reason?: string;
  referenceId?: string;
  createdById?: string;
  // Si el movimiento cuenta para el acumulado histórico (nivel). Los canjes y
  // sus devoluciones NO: gastar puntos no te baja de nivel.
  affectsLifetime: boolean;
};

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  private readonly memberBadgeInclude = {
    badge: {
      select: { id: true, name: true, description: true, icon: true, pointsReward: true },
    },
  } as const;

  private async ensureMember(gymId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
      select: { id: true, pointsBalance: true, lifetimePoints: true },
    });
    if (!member) throw new NotFoundException('Socio no encontrado');
    return member;
  }

  // ------------------------------------------------------------------
  // PUNTOS (ledger)
  // ------------------------------------------------------------------

  // Núcleo de todo movimiento de puntos: actualiza saldo/acumulado y registra
  // el ledger dentro de la transacción recibida. `points` negativo = deducción;
  // si deja el saldo en negativo lanza y la transacción entera se revierte.
  async applyPointsTx(
    tx: GamificationTx,
    gymId: string,
    memberId: string,
    points: number,
    source: PointsSource,
    opts: ApplyPointsOptions,
  ) {
    const updated = await tx.member.update({
      where: { id: memberId },
      data: {
        pointsBalance: { increment: points },
        ...(opts.affectsLifetime ? { lifetimePoints: { increment: points } } : {}),
      },
      select: { pointsBalance: true, lifetimePoints: true },
    });

    if (updated.pointsBalance < 0) {
      throw new BadRequestException(
        `Saldo de puntos insuficiente. Disponible: ${updated.pointsBalance - points}`,
      );
    }
    // Una corrección manual puede superar el acumulado; no lo dejamos negativo.
    if (updated.lifetimePoints < 0) {
      await tx.member.update({ where: { id: memberId }, data: { lifetimePoints: 0 } });
    }

    return tx.pointsTransaction.create({
      data: {
        gymId,
        memberId,
        points,
        balanceAfter: updated.pointsBalance,
        source,
        reason: opts.reason,
        referenceId: opts.referenceId,
        createdById: opts.createdById,
      },
    });
  }

  private applyPoints(
    gymId: string,
    memberId: string,
    points: number,
    source: PointsSource,
    opts: ApplyPointsOptions,
  ) {
    return this.prisma.$transaction((tx) =>
      this.applyPointsTx(tx, gymId, memberId, points, source, opts),
    );
  }

  // GAM-B02 — otorgar puntos manualmente.
  async awardPoints(gymId: string, memberId: string, points: number, reason?: string, userId?: string) {
    await this.ensureMember(gymId, memberId);
    const movement = await this.applyPoints(gymId, memberId, points, 'MANUAL', {
      reason: reason ?? 'Puntos otorgados por el staff',
      createdById: userId,
      affectsLifetime: true,
    });
    const newBadges = await this.evaluateBadges(gymId, memberId);
    return { movement, newBadges };
  }

  // GAM-B02 — deducir puntos manualmente (corrección/penalización). Reduce
  // también el acumulado histórico, porque corrige puntos mal otorgados.
  async deductPoints(gymId: string, memberId: string, points: number, reason?: string, userId?: string) {
    const member = await this.ensureMember(gymId, memberId);
    if (member.pointsBalance < points) {
      throw new BadRequestException(
        `El socio solo tiene ${member.pointsBalance} puntos disponibles`,
      );
    }
    const movement = await this.applyPoints(gymId, memberId, -points, 'MANUAL', {
      reason: reason ?? 'Puntos deducidos por el staff',
      createdById: userId,
      affectsLifetime: true,
    });
    return { movement };
  }

  // GAM-B02 — historial de movimientos de puntos de un socio (paginado).
  async pointsHistory(gymId: string, memberId: string, page = 1, pageSize = 20) {
    await this.ensureMember(gymId, memberId);
    const where = { gymId, memberId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.pointsTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.pointsTransaction.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // GAM-B02 — resumen de gamificación del socio: saldo, nivel, progreso al
  // siguiente nivel e insignias. Lo consume el perfil (admin y portal).
  async summary(gymId: string, memberId: string) {
    const member = await this.ensureMember(gymId, memberId);
    const [tiers, badges] = await Promise.all([
      this.findTiers(gymId),
      this.prisma.memberBadge.findMany({
        where: { gymId, memberId },
        orderBy: { awardedAt: 'desc' },
        include: this.memberBadgeInclude,
      }),
    ]);

    const { tier, nextTier } = this.resolveTier(tiers, member.lifetimePoints);
    const pointsToNextTier = nextTier ? nextTier.minPoints - member.lifetimePoints : 0;
    const base = tier?.minPoints ?? 0;
    const progress = nextTier
      ? Math.min(1, Math.max(0, (member.lifetimePoints - base) / (nextTier.minPoints - base)))
      : 1;

    return {
      memberId,
      pointsBalance: member.pointsBalance,
      lifetimePoints: member.lifetimePoints,
      tier,
      nextTier,
      pointsToNextTier,
      progress,
      tiers,
      badges,
    };
  }

  // Hook del check-in (AttendanceService). Nunca debe romper el check-in: si
  // algo falla se loguea y la asistencia queda registrada igual.
  async onCheckIn(gymId: string, memberId: string, attendanceId: string) {
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const todayCount = await this.prisma.attendance.count({
        where: { gymId, memberId, checkedInAt: { gte: start } },
      });

      let pointsAwarded = 0;
      if (todayCount <= 1) {
        await this.applyPoints(gymId, memberId, ATTENDANCE_POINTS, 'ATTENDANCE', {
          reason: 'Asistencia al gym',
          referenceId: attendanceId,
          affectsLifetime: true,
        });
        pointsAwarded = ATTENDANCE_POINTS;
      }
      const newBadges = await this.evaluateBadges(gymId, memberId);
      return { pointsAwarded, newBadges };
    } catch (err) {
      this.logger.error(
        `Gamificación falló en check-in gym=${gymId} member=${memberId}: ${(err as Error)?.message ?? err}`,
      );
      return { pointsAwarded: 0, newBadges: [] };
    }
  }

  // ------------------------------------------------------------------
  // NIVELES (tiers)
  // ------------------------------------------------------------------

  findCustomTiers(gymId: string) {
    return this.prisma.tier.findMany({
      where: { gymId },
      orderBy: { minPoints: 'asc' },
    });
  }

  async findTiers(gymId: string): Promise<TierInfo[]> {
    const tiers = await this.findCustomTiers(gymId);
    if (tiers.length === 0) {
      return DEFAULT_TIERS.map((t) => ({ id: null, ...t }));
    }
    return tiers.map((t) => ({
      id: t.id,
      name: t.name,
      minPoints: t.minPoints,
      color: t.color,
      benefits: t.benefits,
    }));
  }

  // Nivel = el de mayor umbral alcanzado; null si no alcanza ninguno (cuando
  // el gym configuró niveles sin uno de 0 puntos).
  private resolveTier(tiers: TierInfo[], lifetimePoints: number) {
    let tier: TierInfo | null = null;
    let nextTier: TierInfo | null = null;
    for (const t of tiers) {
      if (t.minPoints <= lifetimePoints) tier = t;
      else {
        nextTier = t;
        break;
      }
    }
    return { tier, nextTier };
  }

  createTier(gymId: string, dto: CreateTierDto) {
    return this.prisma.tier.create({ data: { ...dto, gymId } });
  }

  private async findTier(gymId: string, id: string) {
    const tier = await this.prisma.tier.findFirst({ where: { id, gymId } });
    if (!tier) throw new NotFoundException('Nivel no encontrado');
    return tier;
  }

  async updateTier(gymId: string, id: string, dto: UpdateTierDto) {
    await this.findTier(gymId, id);
    return this.prisma.tier.update({ where: { id }, data: dto });
  }

  async removeTier(gymId: string, id: string) {
    await this.findTier(gymId, id);
    return this.prisma.tier.delete({ where: { id } });
  }

  // ------------------------------------------------------------------
  // INSIGNIAS (badges)
  // ------------------------------------------------------------------

  findBadges(gymId: string) {
    return this.prisma.badge.findMany({
      where: { gymId },
      orderBy: [{ criteria: 'asc' }, { threshold: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { memberBadges: true } } },
    });
  }

  private async findBadge(gymId: string, id: string) {
    const badge = await this.prisma.badge.findFirst({ where: { id, gymId } });
    if (!badge) throw new NotFoundException('Insignia no encontrada');
    return badge;
  }

  private assertBadgeRule(criteria: BadgeCriteria, threshold?: number | null) {
    if (criteria !== 'MANUAL' && !threshold) {
      throw new BadRequestException(
        'threshold es obligatorio para insignias automáticas (asistencias o puntos)',
      );
    }
  }

  createBadge(gymId: string, dto: CreateBadgeDto) {
    this.assertBadgeRule(dto.criteria ?? 'MANUAL', dto.threshold);
    return this.prisma.badge.create({ data: { ...dto, gymId } });
  }

  async updateBadge(gymId: string, id: string, dto: UpdateBadgeDto) {
    const badge = await this.findBadge(gymId, id);
    this.assertBadgeRule(dto.criteria ?? badge.criteria, dto.threshold ?? badge.threshold);
    return this.prisma.badge.update({ where: { id }, data: dto });
  }

  async removeBadge(gymId: string, id: string) {
    await this.findBadge(gymId, id);
    return this.prisma.badge.delete({ where: { id } });
  }

  // Crea el set inicial de insignias, salteando las que ya existan por nombre.
  async createDefaultBadges(gymId: string) {
    const existing = await this.prisma.badge.findMany({
      where: { gymId },
      select: { name: true },
    });
    const names = new Set(existing.map((b) => b.name));
    const data = DEFAULT_BADGES
      .filter((b) => !names.has(b.name))
      .map((b) => ({ ...b, gymId }));
    if (data.length > 0) {
      await this.prisma.badge.createMany({ data });
    }
    return this.findBadges(gymId);
  }

  // Otorga una insignia a mano (típicamente las de criteria MANUAL).
  async awardBadge(gymId: string, badgeId: string, memberId: string) {
    const badge = await this.findBadge(gymId, badgeId);
    await this.ensureMember(gymId, memberId);

    const already = await this.prisma.memberBadge.findFirst({
      where: { gymId, memberId, badgeId },
    });
    if (already) throw new ConflictException('El socio ya tiene esta insignia');

    const memberBadge = await this.unlockBadge(gymId, memberId, badge);
    const chained = await this.evaluateBadges(gymId, memberId);
    return { memberBadge, newBadges: chained };
  }

  // Crea el MemberBadge y acredita su bono. Devuelve null si otro proceso ya la
  // había desbloqueado (carrera entre dos check-ins, unique memberId+badgeId).
  private async unlockBadge(
    gymId: string,
    memberId: string,
    badge: { id: string; name: string; pointsReward: number },
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const memberBadge = await tx.memberBadge.create({
          data: { gymId, memberId, badgeId: badge.id },
          include: this.memberBadgeInclude,
        });
        if (badge.pointsReward > 0) {
          await this.applyPointsTx(tx, gymId, memberId, badge.pointsReward, 'BADGE', {
            reason: `Insignia desbloqueada: ${badge.name}`,
            referenceId: memberBadge.id,
            affectsLifetime: true,
          });
        }
        return memberBadge;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  // Revisa las insignias automáticas que el socio todavía no tiene y
  // desbloquea las que ya cumple. Repite porque el bono de una insignia puede
  // hacer cumplir otra de LIFETIME_POINTS (acotado para evitar bucles).
  async evaluateBadges(gymId: string, memberId: string) {
    const unlocked: NonNullable<Awaited<ReturnType<GamificationService['unlockBadge']>>>[] = [];

    for (let round = 0; round < 5; round++) {
      const candidates = await this.prisma.badge.findMany({
        where: {
          gymId,
          active: true,
          criteria: { not: 'MANUAL' },
          memberBadges: { none: { memberId } },
        },
      });
      if (candidates.length === 0) break;

      const member = await this.ensureMember(gymId, memberId);
      const needsAttendance = candidates.some((b) => b.criteria === 'ATTENDANCE_COUNT');
      const attendanceCount = needsAttendance
        ? await this.prisma.attendance.count({ where: { gymId, memberId } })
        : 0;

      const reached = candidates.filter((b) => {
        const threshold = b.threshold ?? Infinity;
        if (b.criteria === 'ATTENDANCE_COUNT') return attendanceCount >= threshold;
        if (b.criteria === 'LIFETIME_POINTS') return member.lifetimePoints >= threshold;
        return false;
      });
      if (reached.length === 0) break;

      for (const badge of reached) {
        const memberBadge = await this.unlockBadge(gymId, memberId, badge);
        if (memberBadge) unlocked.push(memberBadge);
      }
    }
    return unlocked;
  }

  // GAM-F02 — insignias desbloqueadas que el socio todavía no vio (pop-up).
  unseenBadges(gymId: string, memberId: string) {
    return this.prisma.memberBadge.findMany({
      where: { gymId, memberId, seenAt: null },
      orderBy: { awardedAt: 'asc' },
      include: this.memberBadgeInclude,
    });
  }

  async markBadgesSeen(gymId: string, memberId: string, ids?: string[]) {
    const { count } = await this.prisma.memberBadge.updateMany({
      where: { gymId, memberId, seenAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { seenAt: new Date() },
    });
    return { updated: count };
  }
}
