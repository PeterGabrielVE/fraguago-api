import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { ScopedPrismaClient, TENANT_PRISMA } from "../../prisma/prisma.service";
import { PasswordService } from "../../auth/password.service";

import { CreateMemberDto } from "./dto/create-member.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";
import { MemberStatus } from "@prisma/client";

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
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly passwords: PasswordService,
  ) {}

  // ============================================================
  // VALIDACIÓN REUTILIZABLE (create + update)
  // ============================================================
  //
  // Valida que email (en User) y cédula (en Member) no colisionen con
  // OTRO registro del mismo gym. En update se pasa excludeMemberId para
  // que el propio member no se marque como duplicado de sí mismo.
  // ============================================================

  private async assertNoDuplicates(
    gymId: string,
    data: { email?: string; identificationNumber?: string },
    excludeMemberId?: string,
  ) {
    if (data.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          gymId,
          email: data.email,
          ...(excludeMemberId
            ? { member: { id: { not: excludeMemberId } } }
            : {}),
        },
      });
      if (existingUser) {
        throw new ConflictException(
          "That email is already registered in this gym.",
        );
      }
    }

    if (data.identificationNumber) {
      const existingMember = await this.prisma.member.findFirst({
        where: {
          gymId,
          identificationNumber: data.identificationNumber,
          ...(excludeMemberId ? { id: { not: excludeMemberId } } : {}),
        },
      });
      if (existingMember) {
        throw new ConflictException(
          `Ya existe un miembro con la cédula ${data.identificationNumber}.`,
        );
      }
    }
  }

  // ============================================================
  // CREATE MEMBER
  // ============================================================
  //
  // Creates: User └── Profile └── Member
  // ============================================================

  async create(gymId: string, dto: CreateMemberDto) {
    await this.assertNoDuplicates(gymId, {
      email: dto.email,
      identificationNumber: dto.identificationNumber,
    });

    // Nunca un password por defecto fijo: si no viene, generamos uno
    // aleatorio. El miembro deberá resetearlo (flujo de activación).
    const rawPassword = dto.password ?? randomBytes(16).toString("hex");
    const passwordHash = await this.passwords.hash(rawPassword);

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
            include: { profile: true },
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
        user: { include: { profile: true } },
        memberships: { include: { plan: true } },
      },
    });
  }

  // ============================================================
  // FIND ONE
  // ============================================================

  async findOne(gymId: string, id: string) {
    const member = await this.prisma.member.findFirst({
      where: { id, gymId },
      include: {
        user: { include: { profile: true } },
        memberships: { include: { plan: true } },
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
    // Confirma existencia + pertenencia al gym (aislamiento tenant).
    const member = await this.findOne(gymId, id);

    // Valida duplicados excluyéndose a sí mismo.
    await this.assertNoDuplicates(
      gymId,
      { email: dto.email, identificationNumber: dto.identificationNumber },
      id,
    );

    const {
      firstName,
      lastName,
      phone,
      email,
      birthDate,
      identificationNumber,
      activityLevel,
      preferredShift,
      primaryGoal,
      goalDescription,
    } = dto;

    return this.prisma.$transaction(async (tx) => {
      // Update User
      if (email) {
        await tx.user.update({
          where: { id: member.userId },
          data: { email },
        });
      }

      // Update Profile
      if (
        firstName !== undefined ||
        lastName !== undefined ||
        phone !== undefined
      ) {
        await tx.profile.update({
          where: { userId: member.userId },
          data: { firstName, lastName, phone },
        });
      }

      // Update Member
      return tx.member.update({
        where: { id },
        data: {
          identificationNumber,
          birthDate: birthDate ? new Date(birthDate) : undefined,
          activityLevel,
          preferredShift,
          primaryGoal,
          goalDescription,
        },
        include: {
          user: { include: { profile: true } },
        },
      });
    });
  }

  // ============================================================
  // DELETE
  // ============================================================

  async remove(gymId: string, id: string) {
    const member = await this.findOne(gymId, id);

    // Member -> User -> Profile con onDelete: Cascade.
    // Borrar el Member primero es lo más seguro.
    return this.prisma.member.delete({
      where: { id: member.id },
    });
  }

  // ============================================================
  // CARD DATA
  // ============================================================

  async cardData(gymId: string, id: string) {
    const member = await this.findOne(gymId, id);

    const membership = await this.prisma.membership.findFirst({
      where: { gymId, memberId: id, status: "active" },
      orderBy: { endDate: "desc" },
      include: { plan: { select: { name: true } } },
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


  private readonly ALLOWED_TRANSITIONS: Record<MemberStatus, MemberStatus[]> = {
    ACTIVE: [MemberStatus.SUSPENDED, MemberStatus.INACTIVE],
    SUSPENDED: [MemberStatus.ACTIVE, MemberStatus.INACTIVE],
    INACTIVE: [MemberStatus.ACTIVE],
  };

  async changeStatus(gymId: string, id: string, newStatus: MemberStatus) {
    // 1. Existe y pertenece a este gym (aislamiento tenant)
    const member = await this.findOne(gymId, id);

    // 2. No-op: ya está en ese estado
    if (member.status === newStatus) {
      throw new BadRequestException(`El miembro ya está ${newStatus}.`);
    }

    // 3. ¿Es una transición permitida?
    const allowed = this.ALLOWED_TRANSITIONS[member.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Transición no permitida: ${member.status} → ${newStatus}.`,
      );
    }

    // 4. Aplicar el cambio
    const updated = await this.prisma.member.update({
      where: { id },
      data: { status: newStatus },
      include: {
        user: { include: { profile: true } },
      },
    });

    // 5. (Opcional) efectos secundarios según el nuevo estado.
    //    Ej: al suspender, podrías congelar membresías activas.
    //    Lo dejo marcado como punto de extensión, sin implementar,
    //    para que decidas la regla de negocio.
    // if (newStatus === MemberStatus.SUSPENDED) { ... }

    return {
      id: updated.id,
      status: updated.status,
      fullName: updated.user.profile
        ? `${updated.user.profile.firstName} ${updated.user.profile.lastName}`
        : undefined,
    };
  }
}