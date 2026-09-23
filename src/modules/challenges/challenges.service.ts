import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Challenge, ChallengeMetric, ChallengeParticipant, Prisma } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';
import { ChallengeEventsService } from './challenge-events.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { UpdateChallengeDto } from './dto/update-challenge.dto';
import { ChallengeStatus, ListChallengesQueryDto } from './dto/list-challenges-query.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DURATION_DAYS = 366;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Métricas que dispara cada tipo de actividad (COM-B03).
export const ATTENDANCE_METRICS: ChallengeMetric[] = ['ATTENDANCE_COUNT', 'ATTENDANCE_DAYS'];
export const ROUTINE_METRICS: ChallengeMetric[] = ['ROUTINE_COMPLETIONS'];

// Campos que no se pueden cambiar una vez que el reto empezó y tiene
// participantes: cambiarlos alteraría las reglas a mitad de competencia.
const LOCKED_AFTER_START = ['metric', 'goal', 'startsAt', 'pointsReward'] as const;

export type ChallengeProgressUpdate = {
  challengeId: string;
  name: string;
  progress: number;
  goal: number;
  completed: boolean; // true solo si se completó en ESTA actualización
};

export type LeaderboardEntry = {
  rank: number;
  memberId: string;
  name: string;
  progress: number;
  percent: number;
  completedAt: Date | null;
  joinedAt: Date;
  isMe: boolean;
};

type ProfileName = { firstName?: string | null; lastName?: string | null } | null | undefined;

@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly gamification: GamificationService,
    private readonly events: ChallengeEventsService,
  ) {}

  private readonly participantMemberInclude = {
    member: {
      select: {
        id: true,
        user: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    },
  } as const;

  // ------------------------------------------------------------------
  // Helpers de fechas / estado
  // ------------------------------------------------------------------

  // "YYYY-MM-DD" → inicio (00:00) o fin (23:59:59.999) de ese día local.
  private parseDate(value: string, edge: 'start' | 'end'): Date {
    if (DATE_ONLY_RE.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return edge === 'start'
        ? new Date(y, m - 1, d, 0, 0, 0, 0)
        : new Date(y, m - 1, d, 23, 59, 59, 999);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Fecha inválida');
    return date;
  }

  statusOf(challenge: Pick<Challenge, 'startsAt' | 'endsAt'>, now = new Date()): ChallengeStatus {
    if (now < challenge.startsAt) return 'UPCOMING';
    if (now >= challenge.endsAt) return 'FINISHED';
    return 'ACTIVE';
  }

  private statusWhere(status: ChallengeStatus | undefined, now: Date): Prisma.ChallengeWhereInput {
    if (status === 'UPCOMING') return { startsAt: { gt: now } };
    if (status === 'ACTIVE') return { startsAt: { lte: now }, endsAt: { gt: now } };
    if (status === 'FINISHED') return { endsAt: { lte: now } };
    return {};
  }

  private statusOrder(status?: ChallengeStatus): Prisma.ChallengeOrderByWithRelationInput {
    if (status === 'ACTIVE') return { endsAt: 'asc' };      // los que cierran antes, primero
    if (status === 'UPCOMING') return { startsAt: 'asc' };  // los próximos a empezar, primero
    if (status === 'FINISHED') return { endsAt: 'desc' };   // los recién terminados, primero
    return { startsAt: 'desc' };
  }

  private assertRules(metric: ChallengeMetric, goal: number, startsAt: Date, endsAt: Date) {
    if (endsAt <= startsAt) {
      throw new BadRequestException('La fecha de fin debe ser posterior a la de inicio');
    }
    const days = Math.ceil((endsAt.getTime() - startsAt.getTime()) / DAY_MS);
    if (days > MAX_DURATION_DAYS) {
      throw new BadRequestException(`Un reto no puede durar más de ${MAX_DURATION_DAYS} días`);
    }
    if (metric === 'ATTENDANCE_DAYS' && goal > days) {
      throw new BadRequestException(
        `La meta (${goal} días) supera la duración del reto (${days} días)`,
      );
    }
  }

  private displayName(profile: ProfileName, anonymize: boolean): string {
    const first = profile?.firstName?.trim() ?? '';
    const last = profile?.lastName?.trim() ?? '';
    if (!first && !last) return 'Socio';
    // En el portal otros socios ven "Ana P." (no el apellido completo).
    return anonymize ? `${first} ${last ? `${last[0]}.` : ''}`.trim() : `${first} ${last}`.trim();
  }

  // ------------------------------------------------------------------
  // COM-B01 — CRUD de retos (staff)
  // ------------------------------------------------------------------

  async create(gymId: string, dto: CreateChallengeDto, userId?: string) {
    const startsAt = this.parseDate(dto.startsAt, 'start');
    const endsAt = this.parseDate(dto.endsAt, 'end');
    this.assertRules(dto.metric, dto.goal, startsAt, endsAt);
    if (endsAt <= new Date()) {
      throw new BadRequestException('La fecha de fin debe ser futura');
    }

    const challenge = await this.prisma.challenge.create({
      data: { ...dto, gymId, startsAt, endsAt, createdById: userId },
    });
    return { ...challenge, status: this.statusOf(challenge), participantsCount: 0 };
  }

  async findAll(gymId: string, { status, page = 1, pageSize = 20 }: ListChallengesQueryDto) {
    const now = new Date();
    const where: Prisma.ChallengeWhereInput = { gymId, ...this.statusWhere(status, now) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.challenge.findMany({
        where,
        orderBy: this.statusOrder(status),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { participants: true } } },
      }),
      this.prisma.challenge.count({ where }),
    ]);
    const data = rows.map(({ _count, ...c }) => ({
      ...c,
      status: this.statusOf(c, now),
      participantsCount: _count.participants,
    }));
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  private async findChallenge(gymId: string, id: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: { id, gymId },
      include: { _count: { select: { participants: true } } },
    });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    return challenge;
  }

  async findOne(gymId: string, id: string) {
    const { _count, ...challenge } = await this.findChallenge(gymId, id);
    return { ...challenge, status: this.statusOf(challenge), participantsCount: _count.participants };
  }

  async update(gymId: string, id: string, dto: UpdateChallengeDto) {
    const current = await this.findChallenge(gymId, id);
    const now = new Date();
    const status = this.statusOf(current, now);
    const participants = current._count.participants;

    if (status === 'FINISHED') {
      throw new BadRequestException('Un reto finalizado no se puede editar');
    }

    const startsAt = dto.startsAt ? this.parseDate(dto.startsAt, 'start') : current.startsAt;
    const endsAt = dto.endsAt ? this.parseDate(dto.endsAt, 'end') : current.endsAt;
    const next = {
      metric: dto.metric ?? current.metric,
      goal: dto.goal ?? current.goal,
      startsAt,
      pointsReward: dto.pointsReward ?? current.pointsReward,
    };

    if (status === 'ACTIVE' && participants > 0) {
      const changed = LOCKED_AFTER_START.filter((field) =>
        field === 'startsAt'
          ? next.startsAt.getTime() !== current.startsAt.getTime()
          : next[field] !== current[field],
      );
      if (changed.length > 0) {
        throw new BadRequestException(
          `El reto ya empezó y tiene participantes: no se puede cambiar ${changed.join(', ')}`,
        );
      }
    }

    this.assertRules(next.metric, next.goal, startsAt, endsAt);
    if (dto.endsAt && endsAt <= now) {
      throw new BadRequestException('La fecha de fin debe ser futura');
    }
    if (dto.maxParticipants !== undefined && dto.maxParticipants < participants) {
      throw new BadRequestException(
        `El cupo no puede ser menor a los ${participants} participantes actuales`,
      );
    }

    const updated = await this.prisma.challenge.update({
      where: { id },
      data: { ...dto, startsAt, endsAt },
    });

    // Cambió la ventana o la meta de un reto sin competencia en curso: se
    // recalcula para que el progreso refleje las reglas nuevas.
    if (participants > 0 && (dto.goal !== undefined || dto.startsAt || dto.endsAt || dto.metric)) {
      await this.recalculateAll(gymId, id);
    } else {
      this.events.emit(gymId, id);
    }
    return { ...updated, status: this.statusOf(updated), participantsCount: participants };
  }

  // Con participantes no se borra (se perdería su historial): se desactiva.
  async remove(gymId: string, id: string) {
    const challenge = await this.findChallenge(gymId, id);
    if (challenge._count.participants > 0) {
      throw new BadRequestException(
        'El reto tiene participantes. Desactívalo en lugar de eliminarlo.',
      );
    }
    return this.prisma.challenge.delete({ where: { id } });
  }

  // ------------------------------------------------------------------
  // Participación (portal del socio)
  // ------------------------------------------------------------------

  // Retos visibles para el socio: solo activos (no desactivados por el staff).
  private async findVisible(gymId: string, id: string) {
    const challenge = await this.findChallenge(gymId, id);
    if (!challenge.active) throw new NotFoundException('Reto no encontrado');
    return challenge;
  }

  async listForMember(gymId: string, memberId: string, status?: ChallengeStatus) {
    const now = new Date();
    const rows = await this.prisma.challenge.findMany({
      where: { gymId, active: true, ...this.statusWhere(status, now) },
      orderBy: this.statusOrder(status),
      take: 100,
      include: {
        _count: { select: { participants: true } },
        participants: { where: { memberId }, take: 1 },
      },
    });
    return rows.map(({ _count, participants, ...c }) => ({
      ...c,
      status: this.statusOf(c, now),
      participantsCount: _count.participants,
      myParticipation: participants[0] ?? null,
    }));
  }

  async findForMember(gymId: string, id: string, memberId: string) {
    const { _count, ...challenge } = await this.findVisible(gymId, id);
    const myParticipation = await this.prisma.challengeParticipant.findFirst({
      where: { gymId, challengeId: id, memberId },
    });
    return {
      ...challenge,
      status: this.statusOf(challenge),
      participantsCount: _count.participants,
      myParticipation,
    };
  }

  async join(gymId: string, challengeId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
      select: { status: true },
    });
    if (!member) throw new NotFoundException('Socio no encontrado');
    if (member.status !== 'ACTIVE') {
      throw new BadRequestException('Tu cuenta de socio no está activa');
    }

    const challenge = await this.findVisible(gymId, challengeId);
    if (this.statusOf(challenge) === 'FINISHED') {
      throw new BadRequestException('El reto ya finalizó');
    }
    // Cupo: chequeo previo. Bajo alta concurrencia podría excederse por pocos
    // lugares; aceptable para un reto (no es un recurso crítico).
    if (challenge.maxParticipants && challenge._count.participants >= challenge.maxParticipants) {
      throw new BadRequestException('El reto no tiene cupos disponibles');
    }

    let participant: ChallengeParticipant;
    try {
      participant = await this.prisma.challengeParticipant.create({
        data: { gymId, challengeId, memberId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya estás inscrito en este reto');
      }
      throw err;
    }

    // Si el reto ya empezó, la actividad desde el inicio cuenta: se calcula ya.
    const result = await this.recalcParticipant(gymId, challenge, participant);
    this.events.emit(gymId, challengeId);
    return { ...participant, progress: result.progress, completedAt: result.completedAt };
  }

  async leave(gymId: string, challengeId: string, memberId: string) {
    const challenge = await this.findVisible(gymId, challengeId);
    const participant = await this.prisma.challengeParticipant.findFirst({
      where: { gymId, challengeId, memberId },
    });
    if (!participant) throw new NotFoundException('No estás inscrito en este reto');
    if (participant.completedAt) {
      throw new BadRequestException('Ya completaste este reto; no puedes abandonarlo');
    }
    if (this.statusOf(challenge) === 'FINISHED') {
      throw new BadRequestException('El reto ya finalizó');
    }
    await this.prisma.challengeParticipant.delete({ where: { id: participant.id } });
    this.events.emit(gymId, challengeId);
    return { left: true };
  }

  // ------------------------------------------------------------------
  // COM-B03 — cálculo de progreso
  // ------------------------------------------------------------------

  // Mide la métrica del socio dentro de [from, to].
  private async measure(gymId: string, memberId: string, metric: ChallengeMetric, from: Date, to: Date) {
    if (metric === 'ATTENDANCE_COUNT') {
      return this.prisma.attendance.count({
        where: { gymId, memberId, checkedInAt: { gte: from, lte: to } },
      });
    }
    if (metric === 'ATTENDANCE_DAYS') {
      const rows = await this.prisma.attendance.findMany({
        where: { gymId, memberId, checkedInAt: { gte: from, lte: to } },
        select: { checkedInAt: true },
      });
      // Días distintos en hora local (mismo criterio que el resto del API).
      return new Set(rows.map((r) => r.checkedInAt.toDateString())).size;
    }
    return this.prisma.routineLog.count({
      where: { gymId, memberId, completedAt: { gte: from, lte: to } },
    });
  }

  // Recalcula el progreso de un participante desde los datos fuente (idempotente)
  // y, si alcanzó la meta por primera vez, lo marca completado y acredita el
  // premio. El updateMany condicional (completedAt: null) garantiza que el
  // premio se pague una sola vez aunque dos requests lleguen a la vez.
  private async recalcParticipant(
    gymId: string,
    challenge: Pick<Challenge, 'id' | 'name' | 'metric' | 'goal' | 'startsAt' | 'endsAt' | 'pointsReward'>,
    participant: Pick<ChallengeParticipant, 'id' | 'memberId' | 'progress' | 'completedAt'>,
  ) {
    const now = new Date();
    const to = now < challenge.endsAt ? now : challenge.endsAt;
    const progress = now < challenge.startsAt
      ? 0
      : await this.measure(gymId, participant.memberId, challenge.metric, challenge.startsAt, to);

    if (progress !== participant.progress) {
      await this.prisma.challengeParticipant.update({
        where: { id: participant.id },
        data: { progress },
      });
    }

    let completedNow = false;
    let completedAt = participant.completedAt;
    if (progress >= challenge.goal && !participant.completedAt) {
      completedAt = new Date();
      completedNow = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.challengeParticipant.updateMany({
          where: { id: participant.id, completedAt: null },
          data: { completedAt },
        });
        if (count === 0) return false; // otro proceso ya lo completó
        if (challenge.pointsReward > 0) {
          await this.gamification.applyPointsTx(
            tx, gymId, participant.memberId, challenge.pointsReward, 'CHALLENGE',
            {
              reason: `Reto completado: ${challenge.name}`,
              referenceId: challenge.id,
              affectsLifetime: true,
            },
          );
        }
        return true;
      });
      if (completedNow && challenge.pointsReward > 0) {
        // Los puntos del premio pueden desbloquear insignias de LIFETIME_POINTS.
        await this.gamification.evaluateBadges(gymId, participant.memberId);
      }
    }

    return { progress, completedAt, completedNow };
  }

  // Hook de actividad (check-in, rutina completada). Nunca rompe la acción
  // que lo dispara: si falla se loguea y devuelve [].
  async onActivity(gymId: string, memberId: string, metrics: ChallengeMetric[]): Promise<ChallengeProgressUpdate[]> {
    try {
      const now = new Date();
      const participations = await this.prisma.challengeParticipant.findMany({
        where: {
          gymId,
          memberId,
          challenge: {
            active: true,
            metric: { in: metrics },
            startsAt: { lte: now },
            endsAt: { gt: now },
          },
        },
        include: { challenge: true },
      });

      const updates: ChallengeProgressUpdate[] = [];
      for (const participation of participations) {
        const { challenge } = participation;
        const result = await this.recalcParticipant(gymId, challenge, participation);
        this.events.emit(gymId, challenge.id);
        updates.push({
          challengeId: challenge.id,
          name: challenge.name,
          progress: result.progress,
          goal: challenge.goal,
          completed: result.completedNow,
        });
      }
      return updates;
    } catch (err) {
      this.logger.error(
        `Progreso de retos falló gym=${gymId} member=${memberId}: ${(err as Error)?.message ?? err}`,
      );
      return [];
    }
  }

  // Recalcula a todos los participantes (tras editar reglas, o a pedido del
  // staff si se corrigieron asistencias).
  async recalculateAll(gymId: string, challengeId: string) {
    const challenge = await this.findChallenge(gymId, challengeId);
    const participants = await this.prisma.challengeParticipant.findMany({
      where: { gymId, challengeId },
    });
    let completed = 0;
    for (const participant of participants) {
      const result = await this.recalcParticipant(gymId, challenge, participant);
      if (result.completedNow) completed++;
    }
    this.events.emit(gymId, challengeId);
    return { recalculated: participants.length, newlyCompleted: completed };
  }

  // ------------------------------------------------------------------
  // COM-B02 — leaderboard
  // ------------------------------------------------------------------

  // Orden: más progreso primero; a igual progreso, quien completó antes; luego
  // quien se inscribió antes. Empates reales (mismo progreso y sin/misma fecha
  // de completado) comparten posición (ranking 1, 2, 2, 4).
  async leaderboard(
    gymId: string,
    challengeId: string,
    opts: { limit?: number; viewerMemberId?: string; anonymize?: boolean; visibleOnly?: boolean } = {},
  ) {
    const { _count, ...challenge } = opts.visibleOnly
      ? await this.findVisible(gymId, challengeId)
      : await this.findChallenge(gymId, challengeId);

    const participants = await this.prisma.challengeParticipant.findMany({
      where: { gymId, challengeId },
      orderBy: [
        { progress: 'desc' },
        { completedAt: { sort: 'asc', nulls: 'last' } },
        { joinedAt: 'asc' },
      ],
      include: this.participantMemberInclude,
    });

    const ranked: LeaderboardEntry[] = [];
    participants.forEach((p, index) => {
      const prev = participants[index - 1];
      const tied = prev
        && prev.progress === p.progress
        && (prev.completedAt?.getTime() ?? null) === (p.completedAt?.getTime() ?? null);
      ranked.push({
        rank: tied ? ranked[index - 1].rank : index + 1,
        memberId: p.memberId,
        name: this.displayName(p.member.user?.profile, opts.anonymize ?? false),
        progress: p.progress,
        percent: Math.min(100, Math.round((p.progress / challenge.goal) * 100)),
        completedAt: p.completedAt,
        joinedAt: p.joinedAt,
        isMe: p.memberId === opts.viewerMemberId,
      });
    });

    const limit = opts.limit ?? 50;
    return {
      challenge: { ...challenge, status: this.statusOf(challenge), participantsCount: _count.participants },
      totalParticipants: ranked.length,
      completedCount: ranked.filter((e) => e.completedAt).length,
      generatedAt: new Date(),
      entries: ranked.slice(0, limit),
      me: ranked.find((e) => e.isMe) ?? null,
    };
  }

  // Valida que el reto exista (y sea visible si aplica) antes de abrir el stream.
  async assertStreamable(gymId: string, challengeId: string, visibleOnly: boolean) {
    if (visibleOnly) await this.findVisible(gymId, challengeId);
    else await this.findChallenge(gymId, challengeId);
  }
}
