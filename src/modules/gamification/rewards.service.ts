import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RedemptionStatus, Reward, RewardType } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { GamificationService } from './gamification.service';
import { CreateRewardDto } from './dto/create-reward.dto';
import { UpdateRewardDto } from './dto/update-reward.dto';

// Sin 0/O/1/I para que el código se pueda dictar en recepción sin confusión.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class RewardsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly gamification: GamificationService,
  ) {}

  private readonly redemptionInclude = {
    reward: { select: { id: true, name: true, type: true, value: true } },
    member: {
      select: {
        id: true,
        user: {
          select: { profile: { select: { firstName: true, lastName: true } } },
        },
      },
    },
  } as const;

  private generateCode(): string {
    const bytes = randomBytes(8);
    let code = '';
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    return code;
  }

  // Reglas de `value` según el tipo: los descuentos lo requieren y el
  // porcentual va de 1 a 100.
  private assertRewardValue(type: RewardType, value?: number | Prisma.Decimal | null) {
    const v = value === null || value === undefined ? undefined : Number(value);
    if (type === 'DISCOUNT_PERCENT' && (v === undefined || v < 1 || v > 100)) {
      throw new BadRequestException('Un descuento porcentual requiere un valor entre 1 y 100');
    }
    if (type === 'DISCOUNT_AMOUNT' && (v === undefined || v <= 0)) {
      throw new BadRequestException('Un descuento de monto fijo requiere un valor mayor a 0');
    }
  }

  // "YYYY-MM-DD" (input date del panel) = válido hasta el FINAL de ese día
  // local, no hasta la medianoche UTC que da `new Date('YYYY-MM-DD')`.
  private parseValidUntil(value?: string): Date | undefined {
    if (!value) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day, 23, 59, 59, 999);
    }
    return new Date(value);
  }

  // ------------------------------------------------------------------
  // CATÁLOGO (admin)
  // ------------------------------------------------------------------

  findAll(gymId: string) {
    return this.prisma.reward.findMany({
      where: { gymId },
      orderBy: [{ active: 'desc' }, { pointsCost: 'asc' }],
      include: { _count: { select: { redemptions: true } } },
    });
  }

  async findOne(gymId: string, id: string) {
    const reward = await this.prisma.reward.findFirst({ where: { id, gymId } });
    if (!reward) throw new NotFoundException('Recompensa no encontrada');
    return reward;
  }

  create(gymId: string, dto: CreateRewardDto) {
    this.assertRewardValue(dto.type, dto.value);
    return this.prisma.reward.create({
      data: {
        ...dto,
        gymId,
        validUntil: this.parseValidUntil(dto.validUntil),
      },
    });
  }

  async update(gymId: string, id: string, dto: UpdateRewardDto) {
    const reward = await this.findOne(gymId, id);
    this.assertRewardValue(dto.type ?? reward.type, dto.value ?? reward.value);
    return this.prisma.reward.update({
      where: { id },
      data: {
        ...dto,
        validUntil: this.parseValidUntil(dto.validUntil),
      },
    });
  }

  // Con canjes asociados no se borra (se perdería el historial): se desactiva.
  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    const used = await this.prisma.rewardRedemption.count({ where: { gymId, rewardId: id } });
    if (used > 0) {
      throw new BadRequestException(
        'La recompensa ya tiene canjes registrados. Desactívala en lugar de eliminarla.',
      );
    }
    return this.prisma.reward.delete({ where: { id } });
  }

  // ------------------------------------------------------------------
  // VALIDACIÓN DE CANJE
  // ------------------------------------------------------------------

  // Motivo por el que el socio NO puede canjear la recompensa, o null si puede.
  // Es la misma regla que aplica redeem(); el catálogo del portal la usa para
  // deshabilitar el botón y explicar por qué.
  private unavailableReason(
    reward: Reward,
    member: { pointsBalance: number; lifetimePoints: number },
    now = new Date(),
  ): string | null {
    if (!reward.active) return 'Recompensa no disponible';
    if (reward.validUntil && reward.validUntil < now) return 'Recompensa vencida';
    if (reward.stock !== null && reward.stock <= 0) return 'Agotada';
    if (reward.minLifetimePoints && member.lifetimePoints < reward.minLifetimePoints) {
      return `Requiere ${reward.minLifetimePoints} puntos acumulados (nivel)`;
    }
    if (member.pointsBalance < reward.pointsCost) {
      return `Te faltan ${reward.pointsCost - member.pointsBalance} puntos`;
    }
    return null;
  }

  private async findMember(gymId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
      select: { id: true, pointsBalance: true, lifetimePoints: true },
    });
    if (!member) throw new NotFoundException('Socio no encontrado');
    return member;
  }

  // GAM-01 — catálogo que ve el socio: solo recompensas activas y vigentes,
  // cada una con si puede canjearla y, si no, por qué.
  async catalogFor(gymId: string, memberId: string) {
    const member = await this.findMember(gymId, memberId);
    const now = new Date();
    const rewards = await this.prisma.reward.findMany({
      where: {
        gymId,
        active: true,
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      orderBy: { pointsCost: 'asc' },
    });
    return {
      pointsBalance: member.pointsBalance,
      lifetimePoints: member.lifetimePoints,
      data: rewards.map((reward) => {
        const reason = this.unavailableReason(reward, member, now);
        return { ...reward, canRedeem: reason === null, unavailableReason: reason };
      }),
    };
  }

  // GAM-01 — canje: valida reglas, descuenta puntos y stock y genera el código,
  // todo o nada. Las condiciones de carrera (dos canjes simultáneos) las
  // cubren el decremento condicional de stock y el chequeo de saldo negativo
  // dentro de la transacción.
  async redeem(gymId: string, memberId: string, rewardId: string) {
    const member = await this.findMember(gymId, memberId);
    const reward = await this.findOne(gymId, rewardId);

    const reason = this.unavailableReason(reward, member);
    if (reason) throw new BadRequestException(`No se puede canjear: ${reason}`);

    return this.prisma.$transaction(async (tx) => {
      if (reward.stock !== null) {
        const { count } = await tx.reward.updateMany({
          where: { id: reward.id, gymId, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        });
        if (count === 0) throw new BadRequestException('No se puede canjear: Agotada');
      }

      const redemption = await tx.rewardRedemption.create({
        data: {
          gymId,
          memberId,
          rewardId: reward.id,
          pointsSpent: reward.pointsCost,
          code: this.generateCode(),
        },
        include: this.redemptionInclude,
      });

      await this.gamification.applyPointsTx(tx, gymId, memberId, -reward.pointsCost, 'REDEMPTION', {
        reason: `Canje: ${reward.name}`,
        referenceId: redemption.id,
        affectsLifetime: false,
      });

      return redemption;
    });
  }

  // ------------------------------------------------------------------
  // CANJES
  // ------------------------------------------------------------------

  async findRedemptions(gymId: string, page = 1, pageSize = 20, status?: RedemptionStatus) {
    const where: Prisma.RewardRedemptionWhereInput = { gymId };
    if (status) where.status = status;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.rewardRedemption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.redemptionInclude,
      }),
      this.prisma.rewardRedemption.count({ where }),
    ]);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  memberRedemptions(gymId: string, memberId: string) {
    return this.prisma.rewardRedemption.findMany({
      where: { gymId, memberId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { reward: { select: { id: true, name: true, type: true, value: true } } },
    });
  }

  // Recepción valida el código que muestra el socio.
  async findByCode(gymId: string, code: string) {
    const redemption = await this.prisma.rewardRedemption.findFirst({
      where: { gymId, code: code.trim().toUpperCase() },
      include: this.redemptionInclude,
    });
    if (!redemption) throw new NotFoundException('Código de canje no encontrado');
    return redemption;
  }

  private async findPendingRedemption(gymId: string, id: string) {
    const redemption = await this.prisma.rewardRedemption.findFirst({
      where: { id, gymId },
      include: { reward: true },
    });
    if (!redemption) throw new NotFoundException('Canje no encontrado');
    if (redemption.status !== 'PENDING') {
      throw new BadRequestException('El canje ya fue procesado');
    }
    return redemption;
  }

  async fulfill(gymId: string, id: string, userId?: string) {
    await this.findPendingRedemption(gymId, id);
    const { count } = await this.prisma.rewardRedemption.updateMany({
      where: { id, gymId, status: 'PENDING' },
      data: { status: 'FULFILLED', resolvedAt: new Date(), resolvedById: userId },
    });
    if (count === 0) throw new BadRequestException('El canje ya fue procesado');
    return this.prisma.rewardRedemption.findFirst({ where: { id, gymId }, include: this.redemptionInclude });
  }

  // Anula un canje pendiente: devuelve los puntos al socio y la unidad al stock.
  async cancel(gymId: string, id: string, userId?: string) {
    const redemption = await this.findPendingRedemption(gymId, id);

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.rewardRedemption.updateMany({
        where: { id, gymId, status: 'PENDING' },
        data: { status: 'CANCELLED', resolvedAt: new Date(), resolvedById: userId },
      });
      if (count === 0) throw new BadRequestException('El canje ya fue procesado');

      if (redemption.reward.stock !== null) {
        await tx.reward.update({
          where: { id: redemption.rewardId },
          data: { stock: { increment: 1 } },
        });
      }

      await this.gamification.applyPointsTx(
        tx, gymId, redemption.memberId, redemption.pointsSpent, 'REDEMPTION_REFUND',
        {
          reason: `Canje anulado: ${redemption.reward.name}`,
          referenceId: redemption.id,
          createdById: userId,
          affectsLifetime: false,
        },
      );
    });

    return this.prisma.rewardRedemption.findFirst({ where: { id, gymId }, include: this.redemptionInclude });
  }
}
