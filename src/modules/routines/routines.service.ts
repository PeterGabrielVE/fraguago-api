import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateRoutineDto } from './dto/create-routine.dto';
import { UpdateRoutineDto } from './dto/update-routine.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ChallengesService, ROUTINE_METRICS } from '../challenges/challenges.service';

@Injectable()
export class RoutinesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly challenges: ChallengesService,
  ) {}

  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Datos legibles del socio y del entrenador para los listados.
  private readonly relationsInclude = {
    member: {
      select: {
        id: true,
        user: {
          select: { profile: { select: { firstName: true, lastName: true } } },
        },
      },
    },
    trainer: {
      select: {
        id: true,
        user: {
          select: { profile: { select: { firstName: true, lastName: true } } },
        },
      },
    },
  } as const;

  // ROUT-B02 — crea la rutina validando socio (y entrenador si viene).
  async create(gymId: string, dto: CreateRoutineDto) {
    // El socio debe existir y ser de ESTE gym.
    const member = await this.prisma.member.findFirst({
      where: { id: dto.memberId, gymId },
    });
    if (!member) throw new NotFoundException('Socio no encontrado en este gimnasio');

    // Si mandan trainerId, también debe ser de este gym.
    if (dto.trainerId) {
      const trainer = await this.prisma.trainer.findFirst({
        where: { id: dto.trainerId, gymId },
      });
      if (!trainer) {
        throw new NotFoundException('Entrenador no encontrado en este gimnasio');
      }
    }

    return this.prisma.routine.create({
      data: {
        gymId,
        memberId: dto.memberId,
        trainerId: dto.trainerId,
        name: dto.name,
        description: dto.description,
      },
    });
  }

  // ROUT-B01 — listado general paginado.
  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.routine.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.relationsInclude,
      }),
      this.prisma.routine.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // ROUT-B06 — rutinas de un socio específico.
  async findByMember(gymId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, gymId },
    });
    if (!member) throw new NotFoundException('Socio no encontrado en este gimnasio');

    return this.prisma.routine.findMany({
      where: { gymId, memberId },
      orderBy: { createdAt: 'desc' },
      include: this.relationsInclude,
    });
  }

  // ROUT-B03
  async findOne(gymId: string, id: string) {
    const row = await this.prisma.routine.findFirst({
      where: { id, gymId },
      include: this.relationsInclude,
    });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  // ROUT-B04
  async update(gymId: string, id: string, dto: UpdateRoutineDto) {
    await this.findOne(gymId, id); // asegura que sea de ESTE gym

    // Si cambian el trainer, validar que sea de este gym.
    if (dto.trainerId) {
      const trainer = await this.prisma.trainer.findFirst({
        where: { id: dto.trainerId, gymId },
      });
      if (!trainer) {
        throw new NotFoundException('Entrenador no encontrado en este gimnasio');
      }
    }

    return this.prisma.routine.update({ where: { id }, data: dto });
  }

  // ROUT-B05
  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.prisma.routine.delete({ where: { id } });
  }

  // COM-B03 — el socio marca una de SUS rutinas como completada (máx. una vez
  // por día por rutina) y se actualiza el progreso de sus retos de rutinas.
  async logCompletion(gymId: string, memberId: string, routineId: string) {
    const routine = await this.prisma.routine.findFirst({
      where: { id: routineId, gymId, memberId },
      select: { id: true },
    });
    if (!routine) throw new NotFoundException('Rutina no encontrada');

    const alreadyToday = await this.prisma.routineLog.findFirst({
      where: { gymId, memberId, routineId, completedAt: { gte: this.startOfToday() } },
      select: { id: true },
    });
    if (alreadyToday) {
      throw new ConflictException('Ya registraste esta rutina hoy');
    }

    const log = await this.prisma.routineLog.create({
      data: { gymId, memberId, routineId },
    });
    const challenges = await this.challenges.onActivity(gymId, memberId, ROUTINE_METRICS);
    return { ...log, challenges };
  }

  // Ids de las rutinas del socio ya completadas hoy (para el portal).
  async completedToday(gymId: string, memberId: string): Promise<Set<string>> {
    const logs = await this.prisma.routineLog.findMany({
      where: { gymId, memberId, completedAt: { gte: this.startOfToday() } },
      select: { routineId: true },
    });
    return new Set(logs.map((l) => l.routineId));
  }
}