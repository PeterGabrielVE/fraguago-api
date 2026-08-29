import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  // Full history of a member: their memberships and their payments,
  // all scoped by gymId so data never crosses between gyms.
  async ofMember(gymId: string, memberId: string) {
    const [memberships, payments] = await Promise.all([
      this.prisma.membership.findMany({ where: { gymId, memberId }, orderBy: { startDate: 'desc' } }),
      this.prisma.transaction.findMany({
        where: { gymId, memberId, type: 'INCOME' },
        orderBy: { date: 'desc' },
      }),
    ]);
    return { memberships, payments };
  }
}
