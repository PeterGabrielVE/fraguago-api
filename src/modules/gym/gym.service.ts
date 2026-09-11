import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { UpdateGymDto } from './dto/update-gym.dto';

@Injectable()
export class GymService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  // GYM-B01
  async findMine(gymId: string) {
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
      include: {
        _count: { select: { members: true, users: true, trainers: true } },
      },
    });
    if (!gym) throw new NotFoundException('Gimnasio no encontrado');
    return gym;
  }

  // GYM-B02
  update(gymId: string, dto: UpdateGymDto) {
    return this.prisma.gym.update({ where: { id: gymId }, data: dto });
  }
}