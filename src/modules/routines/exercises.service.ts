import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateExerciseDto, UpdateExerciseDto } from './dto/exercise.dto';
import { RoutineExerciseInputDto } from './dto/routine-exercise.dto';

type Tx = Parameters<Parameters<ScopedPrismaClient['$transaction']>[0] extends infer F
  ? F extends (tx: any) => any ? F : never
  : never>[0];

// "  press   banca " → "Press banca" (un solo formato en el catálogo).
export function normalizeExerciseName(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// DB-06 — catálogo de ejercicios del gym.
@Injectable()
export class ExercisesService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  findAll(gymId: string, q?: string) {
    return this.prisma.exercise.findMany({
      where: { gymId, ...(q?.trim() ? { name: { contains: q.trim(), mode: 'insensitive' } } : {}) },
      orderBy: { name: 'asc' },
      include: { _count: { select: { routineExercises: true } } },
      take: 500,
    });
  }

  private async findOne(gymId: string, id: string) {
    const row = await this.prisma.exercise.findFirst({ where: { id, gymId } });
    if (!row) throw new NotFoundException('Ejercicio no encontrado');
    return row;
  }

  // Nombres únicos sin distinguir mayúsculas ("Sentadilla" = "sentadilla").
  private async assertNameFree(gymId: string, name: string, exceptId?: string) {
    const clash = await this.prisma.exercise.findFirst({
      where: { gymId, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new ConflictException(`Ya existe el ejercicio "${name}"`);
  }

  async create(gymId: string, dto: CreateExerciseDto) {
    const name = normalizeExerciseName(dto.name);
    await this.assertNameFree(gymId, name);
    return this.prisma.exercise.create({ data: { ...dto, name, gymId } });
  }

  async update(gymId: string, id: string, dto: UpdateExerciseDto) {
    await this.findOne(gymId, id);
    const name = dto.name ? normalizeExerciseName(dto.name) : undefined;
    if (name) await this.assertNameFree(gymId, name, id);
    return this.prisma.exercise.update({ where: { id }, data: { ...dto, ...(name ? { name } : {}) } });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    const used = await this.prisma.routineExercise.count({ where: { gymId, exerciseId: id } });
    if (used > 0) {
      throw new BadRequestException(`El ejercicio está en ${used} rutina(s): quítalo de ellas antes de borrarlo`);
    }
    return this.prisma.exercise.delete({ where: { id } });
  }

  // Convierte la lista de la rutina en filas de RoutineExercise dentro de la
  // transacción: resuelve cada ejercicio por id (validando que sea del gym) o
  // por nombre, reutilizándolo del catálogo o creándolo.
  async resolveRoutineExercises(tx: Tx, gymId: string, routineId: string, items: RoutineExerciseInputDto[]) {
    const byName = new Map<string, string>(); // nombre en minúsculas → id
    const rows: Prisma.RoutineExerciseCreateManyInput[] = [];
    const orderInDay = new Map<number, number>();

    for (const item of items) {
      let exerciseId = item.exerciseId;
      if (exerciseId) {
        const found = await tx.exercise.findFirst({ where: { id: exerciseId, gymId }, select: { id: true } });
        if (!found) throw new NotFoundException(`Ejercicio ${exerciseId} no encontrado en este gimnasio`);
      } else {
        if (!item.name?.trim()) throw new BadRequestException('Cada ejercicio necesita exerciseId o name');
        const name = normalizeExerciseName(item.name);
        const key = name.toLowerCase();
        exerciseId = byName.get(key);
        if (!exerciseId) {
          const existing = await tx.exercise.findFirst({
            where: { gymId, name: { equals: name, mode: 'insensitive' } },
            select: { id: true },
          });
          exerciseId = existing?.id ?? (await tx.exercise.create({ data: { gymId, name }, select: { id: true } })).id;
          byName.set(key, exerciseId);
        }
      }

      const next = orderInDay.get(item.day) ?? 0;
      orderInDay.set(item.day, next + 1);
      rows.push({
        gymId,
        routineId,
        exerciseId,
        day: item.day,
        order: item.order ?? next,
        sets: item.sets,
        reps: item.reps.trim(),
        restSeconds: item.restSeconds,
        notes: item.notes?.trim() || null,
      });
    }
    if (rows.length) await tx.routineExercise.createMany({ data: rows });
    return rows.length;
  }
}
