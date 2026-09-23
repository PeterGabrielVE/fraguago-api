import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SystemPrismaService } from '../../prisma/system-prisma.service';
import { tenantContext } from '../../common/tenant/tenant.context';
import { AutomationsService } from './automations.service';
import { ReferralsService } from '../referrals/referrals.service';

// Hora local del gimnasio (el contenedor suele correr en UTC).
const CRON_TZ = process.env.RETENTION_CRON_TZ || 'America/Caracas';

// RET-B02 — job diario de retención. Usa SystemPrismaService SOLO para listar
// los gyms; el trabajo de cada gym corre dentro de tenantContext.run, así los
// servicios usan el cliente tenant y RLS sigue protegiendo los datos (un bug
// en una query no puede cruzar datos entre gimnasios).
//
// Limitación: con varias instancias del API, cada una correría el cron. El
// anti-spam de MessageLog evita la mayoría de duplicados, pero en ese caso
// conviene desactivarlo (RETENTION_CRON_ENABLED=false) en todas menos una.
@Injectable()
export class RetentionJob {
  private readonly logger = new Logger(RetentionJob.name);
  private running = false;

  constructor(
    private readonly system: SystemPrismaService,
    private readonly automations: AutomationsService,
    private readonly referrals: ReferralsService,
  ) {}

  @Cron('0 9 * * *', { name: 'retention-daily', timeZone: CRON_TZ })
  async handleDaily() {
    if (process.env.RETENTION_CRON_ENABLED === 'false') return;
    await this.runAllGyms();
  }

  async runAllGyms() {
    if (this.running) {
      this.logger.warn('El job de retención anterior sigue corriendo; se omite esta ejecución');
      return;
    }
    this.running = true;
    const started = Date.now();
    try {
      const gyms = await this.system.gym.findMany({ select: { id: true, name: true } });
      for (const gym of gyms) {
        // Un gym con error no frena a los demás.
        try {
          await tenantContext.run({ gymId: gym.id }, () => this.runGym(gym.id, gym.name));
        } catch (err) {
          this.logger.error(`[${gym.name}] job de retención falló: ${(err as Error)?.message ?? err}`);
        }
      }
      this.logger.log(`Job de retención terminado: ${gyms.length} gym(s) en ${Date.now() - started} ms`);
    } finally {
      this.running = false;
    }
  }

  private async runGym(gymId: string, gymName: string) {
    const results = await this.automations.runAllForGym(gymId);
    for (const r of results) {
      if (r.evaluated > 0) {
        this.logger.log(
          `[${gymName}] mensaje ${r.automationId}: ${r.evaluated} candidatos, ${r.sent} enviados, ` +
          `${r.failed} fallidos, ${r.skipped} omitidos, ${r.alreadyNotified} ya avisados`,
        );
      }
    }
    const referrals = await this.referrals.processPending(gymId);
    if (referrals.rewarded > 0) {
      this.logger.log(`[${gymName}] ${referrals.rewarded} referido(s) premiado(s)`);
    }
  }
}
