import {
  CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { LogsService } from '../modules/logs/logs.service';
import { tenantContext } from '../common/tenant/tenant.context';

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete',
};
const SENSITIVE = ['password', 'passwordhash', 'token', 'secret', 'authorization', 'cvv'];

// Opcional: @AuditSkip() en rutas que NO quieras auditar,
// @AuditAs({ entity, action }) para sobrescribir los valores adivinados.
export const AUDIT_SKIP = 'audit:skip';
export const AUDIT_AS = 'audit:as';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly logs: LogsService,
    private readonly reflector: Reflector,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = ctx.getHandler();
    if (this.reflector.get<boolean>(AUDIT_SKIP, handler)) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const action = METHOD_TO_ACTION[req.method];
    if (!action) return next.handle(); // solo mutaciones

    const gymId = tenantContext.getStore()?.gymId ?? req.user?.gymId;
    if (!gymId) return next.handle();

    const override = this.reflector.get<{ entity?: string; action?: string }>(AUDIT_AS, handler) ?? {};
    const entity = override.entity ?? this.entityFromPath(req);
    const finalAction = override.action ?? action;
    const userId = req.user?.id ?? req.user?.sub ?? null;

    const baseMeta = {
      method: req.method,
      path: req.originalUrl ?? req.url,
      ip: this.getIp(req),
      body: this.sanitize(req.body),
    };

    return next.handle().pipe(
      tap({
        next: (result) => this.persist(
          gymId, userId, finalAction, entity, result?.id,
          { ...baseMeta, outcome: 'SUCCESS' },
        ),
        error: (err) => this.persist(
          gymId, userId, finalAction, entity, req.params?.id,
          { ...baseMeta, outcome: 'FAILURE', error: err?.message ?? String(err) },
        ),
      }),
    );
  }

  private persist(
    gymId: string, userId: string | null, action: string,
    entity: string, entityId: string | undefined, meta: Record<string, unknown>,
  ): void {
    Promise.resolve(this.logs.record(gymId, userId, action, entity, entityId, meta))
      .catch((err) => this.logger.error(
        `AUDIT_FAILURE (${action} ${entity}) gym=${gymId}`,
        err instanceof Error ? err.stack : String(err),
      ));
  }

  /** Toma el primer segmento real de la ruta, ignorando prefijo global. */
  private entityFromPath(req: any): string {
    const path: string = req.route?.path ?? req.url ?? '';
    const seg = path.split('/').filter(Boolean).find((s) => !s.startsWith(':'));
    return seg ?? 'unknown';
  }

  private getIp(req: any): string | null {
    const fwd = req.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.ip ?? req.socket?.remoteAddress ?? null;
  }

  private sanitize(payload: unknown): unknown {
    if (payload === null || typeof payload !== 'object') return payload;
    if (Array.isArray(payload)) return payload.map((p) => this.sanitize(p));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      out[k] = SENSITIVE.some((s) => k.toLowerCase().includes(s)) ? '[REDACTED]' : this.sanitize(v);
    }
    return out;
  }
}