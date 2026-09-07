import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";

@Injectable()
export class MembershipsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  // Assign a plan to a member. endDate = start + plan.durationDays.
  async assign(
    gymId: string,
    input: { memberId: string; planId: string; startDate?: string },
  ) {
    const plan = await this.prisma.membershipPlan.findFirst({
      where: { id: input.planId, gymId },
    });
    if (!plan) throw new NotFoundException("Plan not found");
    const start = input.startDate ? new Date(input.startDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + plan.durationDays);

    return this.prisma.membership.create({
      data: {
        gymId,
        memberId: input.memberId,
        planId: plan.id,
        startDate: start,
        endDate: end,
      },
    });
  }

  findAll(gymId: string) {
    return this.prisma.membership.findMany({
      where: { gymId },
      orderBy: { endDate: "desc" },
      include: {
        member: {
          select: {
            user: {
              select: {
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  // Memberships expiring within N days (feeds notifications + WhatsApp reminders).
  expiring(gymId: string, days = 7) {
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    return this.prisma.membership.findMany({
      where: { gymId, status: "active", endDate: { lte: limit } },
      orderBy: { endDate: "asc" },
      include: {
        member: {
          select: {
            user: {
              select: {
                email: true,
                profile: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
        plan: { select: { name: true } },
      },
    });
  }
}
