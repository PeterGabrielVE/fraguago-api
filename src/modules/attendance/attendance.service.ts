import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  checkIn(gymId: string, memberId: string) {
    return this.prisma.attendance.create({ data: { gymId, memberId } });
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
