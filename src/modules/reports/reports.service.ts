import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberStatus } from "@prisma/client";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Dashboard: the key numbers a gym owner wants at a glance.
  async dashboard(gymId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const [members, activeMemberships, attendanceToday, monthTx] = await Promise.all([
      this.prisma.member.count({ where: { gymId, status: MemberStatus.ACTIVE } }),
      this.prisma.membership.count({ where: { gymId, status: MemberStatus.ACTIVE, endDate: { gte: now } } }),
      this.prisma.attendance.count({ where: { gymId, checkedInAt: { gte: startOfDay } } }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { gymId, date: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
    ]);

    const income = Number(monthTx.find((t) => t.type === 'INCOME')?._sum.amount ?? 0);
    const expense = Number(monthTx.find((t) => t.type === 'EXPENSE')?._sum.amount ?? 0);

    return {
      activeMembers: members,
      activeMemberships,
      attendanceToday,
      month: { income, expense, balance: income - expense },
    };
  }
}
