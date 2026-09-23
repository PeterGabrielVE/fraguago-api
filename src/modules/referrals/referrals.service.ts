import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Referral, ReferralStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { GamificationService } from '../gamification/gamification.service';

// Premios del programa (puntos de gamificación).
export const REFERRER_POINTS = 200;
export const REFERRED_POINTS = 100;
// Solo se puede cargar un código a socios que se inscribieron hace poco: el
// referido tiene que ser alguien NUEVO que trajo el otro socio.
export const REFERRAL_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
// Sin 0/O/1/I para que se pueda dictar sin confusión.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-Z]{2,4}-[A-HJ-NP-Z2-9]{6}$/;

export type ReferralValidation = {
  valid: boolean;
  code: string;
  reason?: string;
  referrer?: { id: string; name: string };
};

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly gamification: GamificationService,
  ) {}

  private readonly peopleInclude = {
    referrer: { select: { id: true, user: { select: { profile: { select: { firstName: true, lastName: true } } } } } },
    referred: { select: { id: true, joinedAt: true, user: { select: { profile: { select: { firstName: true, lastName: true } } } } } },
  } as const;

  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  // "María José" → "MARI"; sin letras utilizables → "FG".
  private codePrefix(firstName?: string | null): string {
    const letters = (firstName ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '');
    return letters.length >= 2 ? letters.slice(0, 4) : 'FG';
  }

  private randomSuffix(): string {
    const bytes = randomBytes(6);
    let out = '';
    for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    return out;
  }

  private fullName(profile?: { firstName?: string | null; lastName?: string | null } | null): string {
    return `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || 'Socio';
  }

  // ------------------------------------------------------------------
  // Generación de códigos
  // ------------------------------------------------------------------

  // Devuelve el código del socio, generándolo la primera vez. Carreras: el
  // updateMany condicional (referralCode: null) evita pisar un código ya
  // asignado, y el unique (gymId, referralCode) resuelve colisiones.
  async ensureCode(gymId: string, memberId: string): Promise<string> {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
      select: { referralCode: true, user: { select: { profile: { select: { firstName: true } } } } },
    });
    if (!member) throw new NotFoundException('Socio no encontrado');
    if (member.referralCode) return member.referralCode;

    const prefix = this.codePrefix(member.user.profile?.firstName);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = `${prefix}-${this.randomSuffix()}`;
      try {
        const { count } = await this.prisma.member.updateMany({
          where: { id: memberId, gymId, referralCode: null },
          data: { referralCode: code },
        });
        if (count === 1) return code;
        // Otro request lo generó primero: devolvemos el que quedó guardado.
        const saved = await this.prisma.member.findFirst({ where: { id: memberId, gymId }, select: { referralCode: true } });
        if (saved?.referralCode) return saved.referralCode;
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        // Colisión de código: se reintenta con otro sufijo.
      }
    }
    throw new ConflictException('No se pudo generar un código único, intenta de nuevo');
  }

  // ------------------------------------------------------------------
  // Validación
  // ------------------------------------------------------------------

  // Valida un código (y, si viene, que el socio referido sea elegible). No
  // lanza: devuelve `valid` + `reason` para mostrarlo en vivo en el formulario.
  async validate(gymId: string, rawCode: string, referredMemberId?: string): Promise<ReferralValidation> {
    const code = this.normalizeCode(rawCode ?? '');
    const fail = (reason: string, referrer?: ReferralValidation['referrer']): ReferralValidation =>
      ({ valid: false, code, reason, referrer });

    if (!CODE_RE.test(code)) return fail('Formato de código inválido (ej. ANA-7K2QX9)');

    const referrer = await this.prisma.member.findFirst({
      where: { gymId, referralCode: code },
      select: { id: true, status: true, user: { select: { profile: { select: { firstName: true, lastName: true } } } } },
    });
    if (!referrer) return fail('El código no existe en este gimnasio');
    const referrerInfo = { id: referrer.id, name: this.fullName(referrer.user.profile) };
    if (referrer.status !== 'ACTIVE') return fail('El socio dueño del código no está activo', referrerInfo);

    if (referredMemberId) {
      if (referredMemberId === referrer.id) return fail('Un socio no puede usar su propio código', referrerInfo);

      const referred = await this.prisma.member.findFirst({
        where: { id: referredMemberId, gymId },
        select: { id: true, joinedAt: true, referredBy: { select: { id: true } } },
      });
      if (!referred) return fail('El socio referido no existe', referrerInfo);
      if (referred.referredBy) return fail('Este socio ya fue registrado como referido', referrerInfo);

      const ageDays = (Date.now() - referred.joinedAt.getTime()) / DAY_MS;
      if (ageDays > REFERRAL_WINDOW_DAYS) {
        return fail(`Solo aplica a socios inscritos en los últimos ${REFERRAL_WINDOW_DAYS} días`, referrerInfo);
      }

      // Evita el "intercambio": A refiere a B y B refiere a A.
      const circular = await this.prisma.referral.findFirst({
        where: { gymId, referrerId: referredMemberId, referredId: referrer.id },
        select: { id: true },
      });
      if (circular) return fail('Estos socios ya están vinculados como referidos al revés', referrerInfo);
    }

    return { valid: true, code, referrer: referrerInfo };
  }

  // ------------------------------------------------------------------
  // Registro y premio
  // ------------------------------------------------------------------

  // RET-B04 — el staff registra que `referredMemberId` llegó con `code`.
  async apply(gymId: string, rawCode: string, referredMemberId: string, userId?: string) {
    const validation = await this.validate(gymId, rawCode, referredMemberId);
    if (!validation.valid || !validation.referrer) {
      throw new BadRequestException(validation.reason ?? 'Código inválido');
    }

    let referral: Referral;
    try {
      referral = await this.prisma.referral.create({
        data: {
          gymId,
          referrerId: validation.referrer.id,
          referredId: referredMemberId,
          code: validation.code,
          createdById: userId,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Este socio ya fue registrado como referido');
      }
      throw err;
    }

    // Si el referido ya tiene membresía, el premio se paga ahora mismo.
    const rewardedNow = await this.tryReward(gymId, referral);
    const saved = await this.prisma.referral.findFirst({
      where: { id: referral.id, gymId },
      include: this.peopleInclude,
    });
    return { ...saved, rewardedNow };
  }

  // Paga el premio si el referido ya tiene al menos una membresía. El
  // updateMany condicional (status PENDING) garantiza pagarlo una sola vez.
  private async tryReward(gymId: string, referral: Pick<Referral, 'id' | 'referrerId' | 'referredId'>): Promise<boolean> {
    const hasMembership = await this.prisma.membership.count({
      where: { gymId, memberId: referral.referredId },
    });
    if (hasMembership === 0) return false;

    const paid = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.referral.updateMany({
        where: { id: referral.id, gymId, status: 'PENDING' },
        data: {
          status: 'REWARDED',
          rewardedAt: new Date(),
          referrerPoints: REFERRER_POINTS,
          referredPoints: REFERRED_POINTS,
        },
      });
      if (count === 0) return false;
      await this.gamification.applyPointsTx(tx, gymId, referral.referrerId, REFERRER_POINTS, 'REFERRAL', {
        reason: 'Premio por referir a un nuevo socio',
        referenceId: referral.id,
        affectsLifetime: true,
      });
      await this.gamification.applyPointsTx(tx, gymId, referral.referredId, REFERRED_POINTS, 'REFERRAL', {
        reason: 'Bienvenida por llegar referido',
        referenceId: referral.id,
        affectsLifetime: true,
      });
      return true;
    });

    if (paid) {
      // Los puntos pueden desbloquear insignias de LIFETIME_POINTS.
      await this.gamification.evaluateBadges(gymId, referral.referrerId);
      await this.gamification.evaluateBadges(gymId, referral.referredId);
    }
    return paid;
  }

  // Hook de MembershipsService.assign: nunca rompe la asignación.
  async onMembershipCreated(gymId: string, memberId: string) {
    try {
      const referral = await this.prisma.referral.findFirst({
        where: { gymId, referredId: memberId, status: 'PENDING' },
      });
      if (referral) await this.tryReward(gymId, referral);
    } catch (err) {
      this.logger.error(`Premio de referido falló gym=${gymId} member=${memberId}: ${(err as Error)?.message ?? err}`);
    }
  }

  // Respaldo del cron diario: paga los pendientes que ya califican.
  async processPending(gymId: string) {
    const pending = await this.prisma.referral.findMany({
      where: { gymId, status: 'PENDING', referred: { memberships: { some: {} } } },
      take: 500,
    });
    let rewarded = 0;
    for (const referral of pending) {
      if (await this.tryReward(gymId, referral)) rewarded++;
    }
    return { pending: pending.length, rewarded };
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------

  async findAll(gymId: string, status: ReferralStatus | undefined, page = 1, pageSize = 20) {
    const where: Prisma.ReferralWhereInput = { gymId, ...(status ? { status } : {}) };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.referral.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.peopleInclude,
      }),
      this.prisma.referral.count({ where }),
    ]);
    const data = rows.map((r) => ({
      ...r,
      referrerName: this.fullName(r.referrer.user.profile),
      referredName: this.fullName(r.referred.user.profile),
    }));
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  // Portal: mi código, reglas del programa y a quiénes referí. Los nombres
  // de los referidos van abreviados ("Ana P.").
  async forMember(gymId: string, memberId: string) {
    const code = await this.ensureCode(gymId, memberId);
    const referrals = await this.prisma.referral.findMany({
      where: { gymId, referrerId: memberId },
      orderBy: { createdAt: 'desc' },
      include: { referred: { select: { user: { select: { profile: { select: { firstName: true, lastName: true } } } } } } },
    });
    return {
      code,
      rewards: { referrerPoints: REFERRER_POINTS, referredPoints: REFERRED_POINTS, windowDays: REFERRAL_WINDOW_DAYS },
      totals: {
        referred: referrals.length,
        rewarded: referrals.filter((r) => r.status === 'REWARDED').length,
        pointsEarned: referrals.reduce((acc, r) => acc + r.referrerPoints, 0),
      },
      referrals: referrals.map((r) => {
        const p = r.referred.user.profile;
        const last = p?.lastName?.trim();
        return {
          id: r.id,
          name: `${p?.firstName ?? 'Socio'} ${last ? `${last[0]}.` : ''}`.trim(),
          status: r.status,
          createdAt: r.createdAt,
          rewardedAt: r.rewardedAt,
          points: r.referrerPoints,
        };
      }),
    };
  }
}
