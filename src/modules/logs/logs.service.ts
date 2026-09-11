import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@Injectable()
export class LogsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient,
  ) {}

  private readonly userInclude = {
    user: {
      select: {
        id: true,
        email: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    },
  } as const;
  
 // === ESCRITURA — lo que usa el audit.interceptor ===
  record(
    gymId: string,
    userId: string | null,
    action: string,
    entity: string,
    entityId?: string | null,
    meta?: any,
  ) {
    return this.prisma.auditLog.create({
      data: {
        gymId,
        userId: userId ?? undefined,
        action,
        entity,
        entityId: entityId ?? undefined,
        meta: meta ?? undefined,
      },
    });
  }

  // AUDIT-B01
  async findAll(gymId: string, { page = 1, pageSize = 20, action, userId }: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      gymId,
      ...(action ? { action } : {}),
      ...(userId ? { userId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.userInclude,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  // AUDIT-B02
  async findOne(gymId: string, id: string) {
    const row = await this.prisma.auditLog.findFirst({
      where: { id, gymId },
      include: this.userInclude,
    });
    if (!row) throw new NotFoundException('Registro no encontrado');
    return row;
  }
}