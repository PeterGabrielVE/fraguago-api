import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateConceptDto } from './dto/create-concept.dto';
import { UpdateConceptDto } from './dto/update-concept.dto';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Injectable()
export class ConceptsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}
  private get model() { return (this.prisma as any).concept; }

  create(gymId: string, data: CreateConceptDto) {
    return this.model.create({ data: { ...data, gymId } });
  }

  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.model.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.model.count({ where }),
    ]);
    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(gymId: string, id: string) {
    const row = await this.model.findFirst({ where: { id, gymId } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async update(gymId: string, id: string, data: UpdateConceptDto) {
    await this.findOne(gymId, id);          // asegura que sea de ESTE gym
    return this.model.update({ where: { id }, data });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.model.delete({ where: { id } });
  }
}