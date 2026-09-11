import {
  Inject, Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ScopedPrismaClient, TENANT_PRISMA } from 'src/prisma/prisma.service';
import { PasswordService } from 'src/auth/password.service';
import { PaginationDto } from 'src/common/dto/pagination.dto';


@Injectable()
export class UsersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly passwords: PasswordService,
  ) {}

  private readonly safeSelect = {
    id: true,
    email: true,
    role: true,
    createdAt: true,
    updatedAt: true,
    profile: {
      select: { firstName: true, lastName: true, phone: true, address: true },
    },
  } as const;

  // USER-B02
  async create(gymId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findFirst({
      where: { gymId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email en este gimnasio');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    return this.prisma.user.create({
      data: {
        gymId,
        email: dto.email,
        passwordHash,
        role: dto.role,
        profile: {
          create: {
            gymId,
            firstName: dto.firstName,
            lastName: dto.lastName || dto.firstName,
            phone: dto.phone,
          },
        },
      },
      select: this.safeSelect,
    });
  }

  // USER-B01
  async findAll(gymId: string, { page = 1, pageSize = 20 }: PaginationDto) {
    const where = { gymId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.safeSelect,
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // USER-B03
  async findOne(gymId: string, id: string) {
    const row = await this.prisma.user.findFirst({
      where: { id, gymId },
      select: this.safeSelect,
    });
    if (!row) throw new NotFoundException('Usuario no encontrado');
    return row;
  }

  // USER-B04
  async update(gymId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(gymId, id);
    return this.prisma.user.update({
      where: { id },
      data: {
        profile: {
          update: {
            ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
            ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            ...(dto.address !== undefined ? { address: dto.address } : {}),
          },
        },
      },
      select: this.safeSelect,
    });
  }

  // USER-B06
  async updateRole(gymId: string, id: string, newRole: Role) {
    const target = await this.findOne(gymId, id);

    const isDemotingPrivileged =
      (target.role === Role.OWNER || target.role === Role.ADMIN) &&
      newRole !== Role.OWNER && newRole !== Role.ADMIN;

    if (isDemotingPrivileged) {
      const privilegedCount = await this.prisma.user.count({
        where: { gymId, role: { in: [Role.OWNER, Role.ADMIN] } },
      });
      if (privilegedCount <= 1) {
        throw new BadRequestException('No podés dejar el gimnasio sin ningún OWNER/ADMIN');
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: { role: newRole },
      select: this.safeSelect,
    });
  }

  // USER-B05
  async remove(gymId: string, id: string, actorId: string) {
    const target = await this.findOne(gymId, id);
    if (id === actorId) {
      throw new ForbiddenException('No podés eliminar tu propio usuario');
    }
    if (target.role === Role.OWNER) {
      throw new ForbiddenException('No se puede eliminar al OWNER del gimnasio');
    }
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}