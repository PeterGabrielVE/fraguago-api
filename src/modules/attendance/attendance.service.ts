import { Inject, Injectable } from "@nestjs/common";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  checkIn(gymId: string, memberId: string) {
    return this.prisma.attendance.create({ data: { gymId, memberId, shift: "MORNING", } });
  }

  // Today's check-ins for the gym.
  today(gymId: string) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.prisma.attendance.findMany({
      where: { gymId, checkedInAt: { gte: start } },
      orderBy: { checkedInAt: "desc" },
      include: {
        member: {
          select: {
            id: true,
            user: {
              select: {
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  ofMember(gymId: string, memberId: string) {
    return this.prisma.attendance.findMany({
      where: { gymId, memberId },
      orderBy: { checkedInAt: "desc" },
      take: 100,
    });
  }
}
