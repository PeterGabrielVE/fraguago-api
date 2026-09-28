import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, filter, interval, map, merge, of, throttleTime } from 'rxjs';
import { PubSubService } from '../../redis/pubsub.service';

const CHANNEL = 'occupancy';

// Cada 25s se manda un ping para que proxies/load balancers no corten el stream.
const HEARTBEAT_MS = 25_000;
// Agrupa ráfagas de entradas/salidas en un aviso por segundo.
const THROTTLE_MS = 1_000;

// Bus de "cambió el aforo de un gym" (Redis pub/sub vía PubSubService, así
// llega a todas las instancias del API). Igual que ChallengeEventsService: el
// stream solo avisa y el cliente vuelve a pedir /occupancy por la API normal.
@Injectable()
export class OccupancyEventsService {
  constructor(private readonly pubsub: PubSubService) {}

  emit(gymId: string) {
    this.pubsub.publish(CHANNEL, { gymId });
  }

  stream(gymId: string): Observable<MessageEvent> {
    const updates = this.pubsub.channel<{ gymId: string }>(CHANNEL).pipe(
      filter((c) => c.gymId === gymId),
      throttleTime(THROTTLE_MS, undefined, { leading: true, trailing: true }),
      map((): MessageEvent => ({ type: 'update', data: { at: new Date().toISOString() } })),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } })),
    );
    return merge(of<MessageEvent>({ type: 'ready', data: {} }), updates, heartbeat);
  }
}
