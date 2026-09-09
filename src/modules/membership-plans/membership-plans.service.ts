import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { UpdateMembershipPlanDto } from './dto/update-membership-plan.dto';

@Injectable()
export class MembershipPlansService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}
  private get model() { return (this.prisma as any).membershipPlan; }

  create(gymId: string, data: CreateMembershipPlanDto) {
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

  async update(gymId: string, id: string, data: UpdateMembershipPlanDto) {
    await this.findOne(gymId, id);
    return this.model.update({ where: { id }, data });
  }

  async remove(gymId: string, id: string) {
    await this.findOne(gymId, id);
    return this.model.delete({ where: { id } });
  }
}