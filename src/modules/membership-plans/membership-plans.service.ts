import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { CreateMembershipPlanDto } from './dto/create-membership-plan.dto';
import { UpdateMembershipPlanDto } from './dto/update-membership-plan.dto';
import { SearchMembershipPlansDto } from './dto/search-membership-plans.dto';
import { paginate } from 'src/common/pagination';

@Injectable()
export class MembershipPlansService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}
  private get model() { return (this.prisma as any).membershipPlan; }

  create(gymId: string, data: CreateMembershipPlanDto) {
    return this.model.create({ data: { ...data, gymId } });
  }

 findAll(gymId: string, query: SearchMembershipPlansDto) {
  return paginate(this.model, {
    where: { gymId },
    orderBy: { createdAt: 'desc' },
    page: query.page,
    pageSize: query.pageSize,
  });
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