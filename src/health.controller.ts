import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

// GET /api/health — público. Lo usan el health check del hosting y un ping
// externo que evita que el plan gratuito duerma el servicio.
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', at: new Date().toISOString() };
  }
}
