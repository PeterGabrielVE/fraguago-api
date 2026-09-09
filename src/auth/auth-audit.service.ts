import { Injectable, Logger } from '@nestjs/common';
import { AuthPrismaService } from './auth-prisma.service';

export type AuthAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'TOKEN_REFRESH'
  | 'TOKEN_REUSE_DETECTED';

interface AuditEntry {
  gymId: string;
  userId?: string;
  action: AuthAction;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuthAuditService {
  private readonly logger = new Logger(AuthAuditService.name);

  constructor(private readonly prisma: AuthPrismaService) {}

  /**
   * Registra un evento de auth. NUNCA lanza: si la auditoría falla, el flujo
   * de login/logout debe continuar. La observabilidad no puede romper la
   * funcionalidad crítica.
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          gymId: entry.gymId,
          userId: entry.userId,
          action: entry.action,
          entity: 'Auth',
          meta: entry.meta as any, // campo Json en Prisma
        },
      });
    } catch (err) {
      // Se traga el error a propósito. Solo lo dejamos en el logger de la app.
      this.logger.error(`Audit log failed for ${entry.action}`, err as Error);
    }
  }
}