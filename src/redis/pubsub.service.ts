import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject, filter, map, share } from 'rxjs';

type Envelope = { channel: string; payload: unknown };

const CHANNEL_PREFIX = 'fraguago:';

// Bus de eventos entre instancias del API. Con REDIS_URL usa Redis pub/sub,
// así un evento emitido en una instancia llega a los streams SSE abiertos en
// cualquier otra. Sin REDIS_URL cae a un Subject en memoria (una sola
// instancia), para que el desarrollo local no dependa de Redis.
@Injectable()
export class PubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(PubSubService.name);
  private readonly local = new Subject<Envelope>();
  private readonly publisher?: Redis;
  private readonly subscriber?: Redis;
  // Canales ya suscritos en Redis (se suscribe una vez por canal y proceso).
  private readonly subscribed = new Set<string>();
  private readonly messages$: Observable<Envelope>;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    if (!url) {
      this.logger.warn('REDIS_URL no configurado: eventos en tiempo real solo en memoria (una instancia).');
      this.messages$ = this.local.asObservable();
      return;
    }

    // Una conexión en modo subscribe no puede publicar: hacen falta dos.
    this.publisher = new Redis(url, { maxRetriesPerRequest: 3 });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
    for (const [name, client] of [['publisher', this.publisher], ['subscriber', this.subscriber]] as const) {
      client.on('error', (err) => this.logger.error(`Redis ${name}: ${err.message}`));
    }
    this.subscriber.on('ready', () => this.logger.log('Conectado a Redis para eventos en tiempo real.'));

    this.messages$ = new Observable<Envelope>((subscriber) => {
      const onMessage = (channel: string, raw: string) => {
        try {
          subscriber.next({ channel: channel.slice(CHANNEL_PREFIX.length), payload: JSON.parse(raw) });
        } catch (err) {
          this.logger.warn(`Mensaje inválido en ${channel}: ${(err as Error).message}`);
        }
      };
      this.subscriber!.on('message', onMessage);
      return () => this.subscriber!.off('message', onMessage);
    }).pipe(share());
  }

  publish<T>(channel: string, payload: T) {
    if (!this.publisher) {
      this.local.next({ channel, payload });
      return;
    }
    // Fire-and-forget: un fallo de Redis no debe romper el check-in/salida;
    // los clientes igual se ponen al día por polling.
    this.publisher.publish(CHANNEL_PREFIX + channel, JSON.stringify(payload)).catch((err) => {
      this.logger.error(`No se pudo publicar en ${channel}: ${err.message}`);
    });
  }

  channel<T>(channel: string): Observable<T> {
    if (this.subscriber && !this.subscribed.has(channel)) {
      this.subscribed.add(channel);
      this.subscriber.subscribe(CHANNEL_PREFIX + channel).catch((err) => {
        this.subscribed.delete(channel);
        this.logger.error(`No se pudo suscribir a ${channel}: ${err.message}`);
      });
    }
    return this.messages$.pipe(
      filter((m) => m.channel === channel),
      map((m) => m.payload as T),
    );
  }

  async onModuleDestroy() {
    await Promise.all([this.publisher?.quit(), this.subscriber?.quit()].map((p) => p?.catch(() => undefined)));
  }
}
