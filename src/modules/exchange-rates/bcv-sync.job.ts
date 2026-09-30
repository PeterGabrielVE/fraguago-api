import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SystemPrismaService } from '../../prisma/system-prisma.service';
import { tenantContext } from '../../common/tenant/tenant.context';
import { ExchangeRatesService } from './exchange-rates.service';

const CRON_TZ = process.env.BCV_CRON_TZ || 'America/Caracas';

// Sincroniza la tasa oficial del BCV en todos los gimnasios cada 12 horas
// (8:00 y 20:00). El BCV publica una vez al día por la tarde, con fecha valor
// del día hábil siguiente: la corrida de las 20:00 la capta ese mismo día.
// Mismo patrón que RetentionJob: SystemPrisma solo lista gyms y el trabajo de
// cada uno corre en su tenantContext (RLS).
// Con varias instancias del API, deja BCV_SYNC_ENABLED=false en todas menos una
// (no duplica filas porque solo se guarda cuando la tasa cambia).
@Injectable()
export class BcvSyncJob implements OnApplicationBootstrap {
  private readonly logger = new Logger(BcvSyncJob.name);
  private running = false;

  constructor(
    private readonly system: SystemPrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  private get enabled() {
    return process.env.BCV_SYNC_ENABLED !== 'false';
  }

  // Al arrancar se sincroniza una vez, para no esperar a la próxima corrida.
  onApplicationBootstrap() {
    if (this.enabled) setTimeout(() => void this.runAllGyms(), 5_000);
  }

  @Cron('0 8,20 * * *', { name: 'bcv-sync', timeZone: CRON_TZ })
  async handleTwiceDaily() {
    if (this.enabled) await this.runAllGyms();
  }

  async runAllGyms() {
    if (this.running) return;
    this.running = true;
    try {
      const gyms = await this.system.gym.findMany({ select: { id: true, name: true } });
      let updated = 0;
      for (const gym of gyms) {
        try {
          const result = await tenantContext.run({ gymId: gym.id }, () => this.exchangeRates.syncFromBcv(gym.id));
          if (result.created > 0) updated++;
        } catch (err) {
          // Servicio caído: se reintenta en la próxima corrida; los pagos siguen con la última tasa.
          this.logger.warn(`[${gym.name}] no se pudo sincronizar la tasa BCV: ${(err as Error)?.message ?? err}`);
          if ((err as { status?: number })?.status === 503) break;
        }
      }
      if (updated > 0) this.logger.log(`Tasa BCV actualizada en ${updated} gym(s)`);
    } catch (err) {
      this.logger.error(`Sincronización BCV falló: ${(err as Error)?.message ?? err}`);
    } finally {
      this.running = false;
    }
  }
}
