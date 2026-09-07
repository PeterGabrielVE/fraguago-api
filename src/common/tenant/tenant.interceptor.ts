import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantContext } from './tenant.context';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const gymId: string | undefined = req.user?.gymId;

    // Sin gymId (rutas públicas: login, health) => pasa sin abrir contexto.
    // No lanzamos 401: RLS es el backstop. Una ruta protegida que llegue aquí
    // sin gymId correrá sin contexto y la base devolverá 0 filas -> falla
    // visible y segura, no una fuga.
    if (!gymId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      tenantContext.run({ gymId }, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}