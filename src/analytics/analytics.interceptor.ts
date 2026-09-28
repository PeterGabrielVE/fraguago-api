import {
  CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AnalyticsService } from './analytics.service';

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete',
};

// Envía a PostHog un evento "api_mutation" por cada escritura exitosa de un
// usuario autenticado, y los errores 5xx como excepciones. Solo metadatos:
// nunca el body (hay datos de salud y personales de los socios).
@Injectable()
export class AnalyticsInterceptor implements NestInterceptor {
  constructor(private readonly analytics: AnalyticsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.id;
    const gymId: string | undefined = req.user?.gymId;
    const action = METHOD_TO_ACTION[req.method];
    // Plantilla de ruta (/members/:id), no la URL real: evita IDs en los eventos.
    const route: string = req.route?.path ?? 'unknown';
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          if (!action || !userId) return;
          this.analytics.capture(userId, 'api_mutation', {
            action,
            entity: this.entityFromRoute(route),
            route,
            method: req.method,
            role: req.user?.role,
            duration_ms: Date.now() - startedAt,
          }, gymId);
        },
        error: (err) => {
          const status = err instanceof HttpException ? err.getStatus() : 500;
          if (status < 500) return;
          this.analytics.captureException(err, userId, {
            route,
            method: req.method,
            status,
            ...(gymId ? { $groups: { gym: gymId } } : {}),
          });
        },
      }),
    );
  }

  /** /api/members/:id/notes -> "members" */
  private entityFromRoute(route: string): string {
    const segs = route.split('/').filter((s) => s && !s.startsWith(':'));
    return (segs[0] === 'api' ? segs[1] : segs[0]) ?? 'unknown';
  }
}
