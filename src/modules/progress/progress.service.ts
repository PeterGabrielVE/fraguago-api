import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CreateMeasurementDto } from './dto/create-measurement.dto';
import { UpdateMeasurementDto } from './dto/update-measurement.dto';

@Injectable()
export class ProgressService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  async create(gymId: string, memberId: string, data: CreateMeasurementDto) {
  // Usar el memberId del PARÁMETRO (viene de la URL), no de data.
  const member = await this.prisma.member.findFirst({
    where: { id: memberId, gymId },
  });

  if (!member) {
    throw new NotFoundException('Miembro no encontrado en este gimnasio');
  }

  return this.prisma.measurement.create({
    data: {
      ...data,
      gymId,
      memberId, 
      date: data.date ? new Date(data.date) : undefined, // string → Date
    },
  });
}

  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto, memberId?: string) {
    const where = { 
      gymId,
      ...(memberId && { memberId })
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.measurement.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          member: {
            select: {
              id: true,
              user: {
                select: { profile: { select: { firstName: true, lastName: true } } },
              },
            },
          },
        },
      }),
      this.prisma.measurement.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async findOne(gymId: string, id: string) {
    const row = await this.prisma.measurement.findFirst({
      where: { id, gymId },
      include: {
        member: {
          select: {
            id: true,
            user: {
              select: { profile: { select: { firstName: true, lastName: true } } },
            },
          },
        },
      },
    });
    
    if (!row) throw new NotFoundException('Medición no encontrada');
    
    return row;
  }

  async update(gymId: string, id: string, data: UpdateMeasurementDto) {
    await this.findOne(gymId, id);
    
    return this.prisma.measurement.update({
      where: { id },
      data,
    });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    
    return this.prisma.measurement.delete({
      where: { id },
    });
  }
}