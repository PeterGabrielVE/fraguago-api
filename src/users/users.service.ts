import {
  Inject, Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ScopedPrismaClient, TENANT_PRISMA } from 'src/prisma/prisma.service';
import { PasswordService } from 'src/auth/password.service';
import { AuthService } from 'src/auth/auth.service';
import { AuthAuditService } from 'src/auth/auth-audit.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { normalizeRoles, primaryRole, PRIVILEGED_ROLES, userRoles } from 'src/auth/user-roles';

type Actor = { id: string; role: Role };
import { PaginationDto } from 'src/common/dto/pagination.dto';


@Injectable()
export class UsersService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly audit: AuthAuditService,
  ) {}

  private readonly safeSelect = {
    id: true,
    email: true,
    role: true,
    roles: true,
    createdAt: true,
    updatedAt: true,
    profile: {
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        address: true,
        preferredTime: true,
      },
    },
  } as const;

  // USER-B02
  async create(gymId: string, dto: CreateUserDto, actor: Actor) {
    const roles = normalizeRoles(dto.roles ?? (dto.role ? [dto.role] : []));
    if (roles.length === 0) {
      throw new BadRequestException('Asigna al menos un rol');
    }
    this.assertCanGrant(roles, actor);
    // Sin ficha de socio el portal no funciona; los socios se dan de alta en Socios.
    if (roles.includes(Role.MEMBER)) {
      throw new BadRequestException('Para el rol Socio, registra a la persona desde Socios');
    }

    const existing = await this.prisma.user.findFirst({
      where: { gymId, email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email en este gimnasio');
    }

    if (dto.confirmPassword !== undefined && dto.confirmPassword !== dto.password) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }

    const passwordHash = await this.passwords.hash(dto.password);

    return this.prisma.user.create({
      data: {
        gymId,
        email: dto.email,
        passwordHash,
        role: primaryRole(roles),
        roles,
        // El rol entrenador necesita su ficha para aparecer en Entrenadores.
        ...(roles.includes(Role.TRAINER) ? { trainer: { create: { gymId } } } : {}),
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
            ...(dto.preferredTime !== undefined ? { preferredTime: dto.preferredTime } : {}),
          },
        },
      },
      select: this.safeSelect,
    });
  }

  // USER-B06 — reemplaza los roles del usuario.
  async updateRoles(gymId: string, id: string, requested: Role[], actor: Actor) {
    const roles = normalizeRoles(requested);
    if (roles.length === 0) {
      throw new BadRequestException('Asigna al menos un rol');
    }

    const target = await this.prisma.user.findFirst({
      where: { id, gymId },
      select: { id: true, role: true, roles: true, member: { select: { id: true } }, trainer: { select: { id: true } } },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const current = userRoles(target);

    // Solo el OWNER puede tocar a otro OWNER o dar el rol OWNER.
    if (current.includes(Role.OWNER) && actor.role !== Role.OWNER) {
      throw new ForbiddenException('Solo el OWNER puede cambiar los roles del OWNER');
    }
    this.assertCanGrant(roles, actor);

    // Sin ficha de socio el portal no funciona.
    if (roles.includes(Role.MEMBER) && !target.member) {
      throw new BadRequestException('Para el rol Socio, registra a la persona desde Socios');
    }

    const isPrivileged = (list: Role[]) => list.some((r) => PRIVILEGED_ROLES.includes(r));
    if (isPrivileged(current) && !isPrivileged(roles)) {
      const privilegedCount = await this.prisma.user.count({
        where: {
          gymId,
          OR: [
            { role: { in: PRIVILEGED_ROLES } },
            { roles: { hasSome: PRIVILEGED_ROLES } },
          ],
        },
      });
      if (privilegedCount <= 1) {
        throw new BadRequestException('No podés dejar el gimnasio sin ningún OWNER/ADMIN');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // El rol entrenador necesita su ficha para aparecer en Entrenadores, rutinas y horarios.
      if (roles.includes(Role.TRAINER) && !target.trainer) {
        await tx.trainer.create({ data: { gymId, userId: id } });
      }
      return tx.user.update({
        where: { id },
        data: { role: primaryRole(roles), roles },
        select: this.safeSelect,
      });
    });

    // Si le quitaron un rol, sus sesiones abiertas con ese rol no pueden seguir.
    const removed = current.some((r) => !roles.includes(r));
    if (removed && id !== actor.id) {
      await this.auth.logoutAll(id);
    }
    return updated;
  }

  private assertCanGrant(roles: Role[], actor: Actor) {
    if (roles.includes(Role.OWNER) && actor.role !== Role.OWNER) {
      throw new ForbiddenException('Solo el OWNER puede asignar el rol OWNER');
    }
  }

  // Cambio de contraseña por un OWNER/ADMIN (o el propio usuario).
  async changePassword(
    gymId: string,
    id: string,
    dto: ChangePasswordDto,
    actor: Actor,
  ) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Las contraseñas no coinciden');
    }
    const target = await this.findOne(gymId, id);
    // Un ADMIN no puede tomar la cuenta del dueño cambiándole la clave.
    if (userRoles(target).includes(Role.OWNER) && actor.role !== Role.OWNER) {
      throw new ForbiddenException('Solo el OWNER puede cambiar la contraseña del OWNER');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    // Si la cambia otro, cerramos las sesiones abiertas de ese usuario (si
    // alguien más conocía la clave anterior, pierde el acceso). La propia
    // sesión de quien la cambia no se toca.
    if (id !== actor.id) {
      await this.auth.logoutAll(id);
    }
    await this.audit.log({
      gymId,
      userId: id,
      action: 'PASSWORD_CHANGED',
      meta: { changedBy: actor.id, sessionsRevoked: id !== actor.id },
    });
    return { success: true };
  }

  // USER-B05
  async remove(gymId: string, id: string, actorId: string) {
    const target = await this.findOne(gymId, id);
    if (id === actorId) {
      throw new ForbiddenException('No podés eliminar tu propio usuario');
    }
    if (userRoles(target).includes(Role.OWNER)) {
      throw new ForbiddenException('No se puede eliminar al OWNER del gimnasio');
    }
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}