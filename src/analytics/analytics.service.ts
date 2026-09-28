import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { PostHog } from 'posthog-node';

type Properties = Record<string, unknown>;

// Wrapper de PostHog. Sin POSTHOG_API_KEY todas las llamadas son no-op, así
// que desarrollo y tests no necesitan cuenta. Nunca lanza: la analítica no
// debe romper una request.
@Injectable()
export class AnalyticsService implements OnApplicationShutdown {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly client: PostHog | null;

  constructor() {
    const apiKey = process.env.POSTHOG_API_KEY;
    this.client = apiKey
      ? new PostHog(apiKey, {
          host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
          enableExceptionAutocapture: true,
        })
      : null;
    if (!this.client) this.logger.log('POSTHOG_API_KEY no definido: analítica desactivada');
  }

  /** gymId agrupa el evento en el grupo "gym" (group analytics por tenant). */
  capture(distinctId: string, event: string, properties: Properties = {}, gymId?: string): void {
    this.safe(() => this.client?.capture({
      distinctId,
      event,
      properties,
      ...(gymId ? { groups: { gym: gymId } } : {}),
    }));
  }

  identify(distinctId: string, properties: Properties = {}): void {
    this.safe(() => this.client?.identify({ distinctId, properties }));
  }

  groupIdentify(gymId: string, properties: Properties = {}): void {
    this.safe(() => this.client?.groupIdentify({ groupType: 'gym', groupKey: gymId, properties }));
  }

  captureException(error: unknown, distinctId?: string, properties: Properties = {}): void {
    this.safe(() => this.client?.captureException(error, distinctId, properties));
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.shutdown();
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.logger.warn(`PostHog: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
