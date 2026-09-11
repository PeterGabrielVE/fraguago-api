import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class SchedulesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  private readonly trainerInclude = {
    trainer: {
      select: {
        id: true,
        user: {
          select: { profile: { select: { firstName: true, lastName: true } } },
        },
      },
    },
  } as const;

  private toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private assertTimeOrder(startTime: string, endTime: string) {
    if (this.toMinutes(endTime) <= this.toMinutes(startTime)) {
      throw new BadRequestException('endTime debe ser posterior a startTime');
    }
  }

  private async assertTrainer(gymId: string, trainerId?: string) {
    if (!trainerId) return;
    const trainer = await this.prisma.trainer.findFirst({
      where: { id: trainerId, gymId },
    });
    if (!trainer) {
      throw new NotFoundException('Entrenador no encontrado en este gimnasio');
    }
  }

  private async assertNoOverlap(
    gymId: string,
    weekday: number,
    startTime: string,
    endTime: string,
    excludeId?: string,
  ) {
    // Dos rangos se cruzan si: startTime < endExistente Y endTime > startExistente.
    const conflict = await this.prisma.schedule.findFirst({
      where: {
        gymId,
        weekday,
        startTime: { lt: endTime },   // empieza antes de que termine la nueva
        endTime: { gt: startTime },   // termina después de que empieza la nueva
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });

    if (conflict) {
      throw new ConflictException(
        `Ya existe una clase en ese horario: "${conflict.title}" (${conflict.startTime}–${conflict.endTime}). El gimnasio tiene una sola sala.`,
      );
    }
  }

  async create(gymId: string, dto: CreateScheduleDto) {
    this.assertTimeOrder(dto.startTime, dto.endTime);
    await this.assertTrainer(gymId, dto.trainerId);
    await this.assertNoOverlap(gymId, dto.weekday, dto.startTime, dto.endTime);

    return this.prisma.schedule.create({
      data: { ...dto, gymId },
      include: this.trainerInclude,
    });
  }

  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where,
        orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.trainerInclude,
      }),
      this.prisma.schedule.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(gymId: string, id: string) {
    const row = await this.prisma.schedule.findFirst({
      where: { id, gymId },
      include: this.trainerInclude,
    });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async update(gymId: string, id: string, dto: UpdateScheduleDto) {
    const current = await this.findOne(gymId, id);

    const weekday = dto.weekday ?? current.weekday;
    const startTime = dto.startTime ?? current.startTime;
    const endTime = dto.endTime ?? current.endTime;

    this.assertTimeOrder(startTime, endTime);
    await this.assertTrainer(gymId, dto.trainerId);

    await this.assertNoOverlap(gymId, weekday, startTime, endTime, id);

    return this.prisma.schedule.update({
      where: { id },
      data: dto,
      include: this.trainerInclude,
    });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.schedule.delete({ where: { id } });
  }
}