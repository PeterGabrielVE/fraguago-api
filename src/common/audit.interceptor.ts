import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LogsService } from '../modules/logs/logs.service';

const METHOD_TO_ACTION: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly logs: LogsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const req = ctx.switchToHttp().getRequest();
    const action = METHOD_TO_ACTION[req.method];
    return next.handle().pipe(
      tap((result) => {
        if (action && req.user?.gymId) {
          const entity = (req.route?.path || '').split('/')[2] || 'unknown';
          this.logs.record(req.user.gymId, req.user.id, action, entity, result?.id).catch(() => void 0);
        }
      }),
    );
  }
}
