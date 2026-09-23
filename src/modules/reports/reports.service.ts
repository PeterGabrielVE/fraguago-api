import { Inject, Injectable } from '@nestjs/common';
import { MemberStatus, MembershipStatus } from "@prisma/client";
import { ScopedPrismaClient, TENANT_PRISMA } from 'src/prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  // Dashboard: the key numbers a gym owner wants at a glance.
  async dashboard(gymId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const [members, activeMemberships, attendanceToday, monthTx] = await Promise.all([
      this.prisma.member.count({ where: { gymId, status: MemberStatus.ACTIVE } }),
      // Membership.status es un String ("active"), NO el enum MemberStatus.
      this.prisma.membership.count({ where: { gymId, status: MembershipStatus.ACTIVE, endDate: { gte: now } } }),
      this.prisma.attendance.count({ where: { gymId, checkedInAt: { gte: startOfDay } } }),
      this.prisma.transaction.groupBy({
        by: ['type'],
        where: { gymId, date: { gte: startOfMonth } },
        // amountBase: todo ya convertido a la moneda base del gym; sumar
        // "amount" crudo mezclaría USD/VES/EUR sin sentido.
        _sum: { amountBase: true },
      }),
    ]);

    const income = Number(monthTx.find((t) => t.type === 'INCOME')?._sum.amountBase ?? 0);
    const expense = Number(monthTx.find((t) => t.type === 'EXPENSE')?._sum.amountBase ?? 0);

    return {
      activeMembers: members,
      activeMemberships,
      attendanceToday,
      month: { income, expense, balance: income - expense },
    };
  }
}
