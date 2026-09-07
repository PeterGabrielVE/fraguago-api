import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';

// Generic multi-tenant CRUD. To add class-validator DTOs and business
// rules, follow the pattern in the `members` module.
@Injectable()
export class ServicesService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}
  private get model() { return (this.prisma as any).service; }

  create(gymId: string, data: any) {
    return this.model.create({ data: { ...data, gymId } });
  }

  findAll(gymId: string) {
    return this.model.findMany({ where: { gymId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(gymId: string, id: string) {
    const row = await this.model.findFirst({ where: { id, gymId } });
    if (!row) throw new NotFoundException('Not found');
    return row;
  }

  async update(gymId: string, id: string, data: any) {
    await this.findOne(gymId, id);          // ensure it belongs to THIS gym
    return this.model.update({ where: { id }, data });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.model.delete({ where: { id } });
  }
}
