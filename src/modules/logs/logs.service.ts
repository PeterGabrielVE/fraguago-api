import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  record(gymId: string, userId: string | null, action: string, entity: string, entityId?: string, meta?: any) {
    return this.prisma.auditLog.create({ data: { gymId, userId, action, entity, entityId, meta } });
  }

  findAll(gymId: string) {
    return this.prisma.auditLog.findMany({ where: { gymId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
}
