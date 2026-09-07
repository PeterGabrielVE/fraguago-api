import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";

import { CreateMemberDto } from "./dto/create-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";

function ageFrom(iso: string): number {
  const today = new Date();
  const dob = new Date(iso);

  let age = today.getFullYear() - dob.getFullYear();

  const m = today.getMonth() - dob.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

@Injectable()
export class MembersService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  // ============================================================
  // CREATE MEMBER
  // ============================================================
  //
  // Creates:
  //
  // User
  //   └── Profile
  //   └── Member
  //
  // User:
  //   - email
  //   - passwordHash
  //   - role
  //   - gymId
  //
  // Profile:
  //   - firstName
  //   - lastName
  //   - phone
  //
  // Member:
  //   - birthDate
  //   - guardian information
  //   - status
  // ============================================================

  async create(gymId: string, dto: CreateMemberDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        gymId,
        email: dto.email,
      },
    });

    if (existingUser) {
      throw new ConflictException(
        "That email is already registered in this gym.",
      );
    }

    const passwordHash = await bcrypt.hash(dto.password ?? "12345678", 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          gymId,
          email: dto.email,
          passwordHash,
          role: "MEMBER",
          profile: {
            create: {
              firstName: dto.firstName,
              lastName: dto.lastName,
              phone: dto.phone,
              gymId,
            },
          },
        },
      });

      const member = await tx.member.create({
        data: {
          gymId,
          userId: user.id,

          identificationNumber: dto.identificationNumber,

          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,

          activityLevel: dto.activityLevel,
          preferredShift: dto.preferredShift,
          primaryGoal: dto.primaryGoal,
          goalDescription: dto.goalDescription,
        },

        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      });

      return member;
    });

    return {
      id: result.id,
      userId: result.userId,
      email: result.user.email,
      firstName: result.user.profile?.firstName,
      lastName: result.user.profile?.lastName,
      phone: result.user.profile?.phone,
      birthDate: result.birthDate,
      status: result.status,
      joinedAt: result.joinedAt,
    };
  }

  // ============================================================
  // FIND ALL
  // ============================================================

  findAll(gymId: string) {
    return this.prisma.member.findMany({
      where: { gymId },
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        memberships: {
          include: {
            plan: true,
          },
        },
      },
    });
  }

  // ============================================================
  // FIND ONE
  // ============================================================

  async findOne(gymId: string, id: string) {
    const member = await this.prisma.member.findFirst({
      where: {
        id,
        gymId,
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        memberships: {
          include: {
            plan: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException("Member not found");
    }

    return member;
  }
  // ============================================================
  // UPDATE
  // ============================================================

  async update(gymId: string, id: string, dto: UpdateMemberDto) {
    const member = await this.findOne(gymId, id);

    const {
      firstName,
      lastName,
      phone,
      email,
      birthDate,
      status,
    } = dto;

    return this.prisma.$transaction(async (tx) => {
      // ----------------------------------------------------------
      // Update User
      // ----------------------------------------------------------

      if (email) {
        await tx.user.update({
          where: {
            id: member.userId,
          },
          data: {
            email,
          },
        });
      }

      // ----------------------------------------------------------
      // Update Profile
      // ----------------------------------------------------------

      if (
        firstName !== undefined ||
        lastName !== undefined ||
        phone !== undefined
      ) {
        await tx.profile.update({
          where: {
            userId: member.userId,
          },
          data: {
            firstName,
            lastName,
            phone,
          },
        });
      }

      // ----------------------------------------------------------
      // Update Member
      // ----------------------------------------------------------

      return tx.member.update({
        where: {
          id,
        },

        data: {
          birthDate: birthDate ? new Date(birthDate) : undefined,
          status,
        },

        include: {
          user: {
            include: {
              profile: true,
            },
          },
        },
      });
    });
  }

  // ============================================================
  // DELETE
  // ============================================================

  async remove(gymId: string, id: string) {
    const member = await this.findOne(gymId, id);

    // Member -> User -> Profile
    //
    // Because Member.user and User.profile use
    // onDelete: Cascade, deleting User will also delete Profile.
    //
    // But Member itself references User, so deleting Member
    // first is the safest approach.

    return this.prisma.member.delete({
      where: {
        id: member.id,
      },
    });
  }

  // ============================================================
  // CARD DATA
  // ============================================================

  // Minimal data for an ID card:
  // name, id, gym, active membership.

  async cardData(gymId: string, id: string) {
    const member = await this.findOne(gymId, id);

    const membership = await this.prisma.membership.findFirst({
      where: {
        gymId,
        memberId: id,
        status: "active",
      },

      orderBy: {
        endDate: "desc",
      },

      include: {
        plan: {
          select: {
            name: true,
          },
        },
      },
    });

    const firstName = member.user.profile?.firstName ?? "";
    const lastName = member.user.profile?.lastName ?? "";

    const fullName = `${firstName} ${lastName}`.trim();

    return {
      id: member.id,
      fullName,
      joinedAt: member.joinedAt,
      membership,
    };
  }
}
