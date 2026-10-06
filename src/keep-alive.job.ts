import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

// Render (plan gratuito) duerme el servicio tras 15 min sin tráfico entrante.
// Cada 10 min el API se pide a sí mismo /api/health por su URL PÚBLICA: la
// petición sale a internet y vuelve a entrar por el proxy de Render, así que
// cuenta como tráfico. Render define RENDER_EXTERNAL_URL solo; en local y en
// Docker no existe y el job no hace nada (o se fuerza con KEEP_ALIVE_URL).
//
// Limitación: si el servicio ya está dormido, este job no corre y no puede
// despertarlo. Por eso el workflow .github/workflows/keep-alive.yml hace el
// mismo ping desde fuera como respaldo.
const KEEP_ALIVE_URL = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
const TIMEOUT_MS = 30_000;

@Injectable()
export class KeepAliveJob {
  private readonly logger = new Logger(KeepAliveJob.name);

  @Cron('*/10 * * * *', { name: 'keep-alive' })
  async ping() {
    if (!KEEP_ALIVE_URL || process.env.KEEP_ALIVE_ENABLED === 'false') return;

    const url = `${KEEP_ALIVE_URL.replace(/\/+$/, '')}/api/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) this.logger.warn(`Keep-alive ${url} respondió ${res.status}`);
    } catch (err) {
      this.logger.warn(`Keep-alive ${url} falló: ${(err as Error)?.message ?? err}`);
    }
  }
}
