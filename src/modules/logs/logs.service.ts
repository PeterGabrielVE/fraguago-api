import { Inject, Injectable } from '@nestjs/common';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {}

  record(gymId: string, userId: string | null, action: string, entity: string, entityId?: string, meta?: any) {
    return this.prisma.auditLog.create({ data: { gymId, userId, action, entity, entityId, meta } });
  }

  findAll(gymId: string) {
    return this.prisma.auditLog.findMany({ where: { gymId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
