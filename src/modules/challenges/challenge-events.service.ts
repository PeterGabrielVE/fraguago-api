import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, filter, interval, map, merge, of, throttleTime } from 'rxjs';
import { PubSubService } from '../../redis/pubsub.service';

type ChallengeChange = { gymId: string; challengeId: string };

const CHANNEL = 'challenges';

// Cada 25s se manda un ping para que proxies/load balancers no corten el stream.
const HEARTBEAT_MS = 25_000;
// Agrupa ráfagas (p. ej. varios check-ins seguidos) en un aviso por segundo.
const THROTTLE_MS = 1_000;

// COM-F02 — bus de "cambió el leaderboard de un reto" (Redis pub/sub vía
// PubSubService, así llega a todas las instancias del API). El stream SSE solo
// avisa; el cliente vuelve a pedir el leaderboard por la API normal, así el
// tiempo real reutiliza la misma autorización y lógica de ranking.
@Injectable()
export class ChallengeEventsService {
  constructor(private readonly pubsub: PubSubService) {}

  emit(gymId: string, challengeId: string) {
    this.pubsub.publish<ChallengeChange>(CHANNEL, { gymId, challengeId });
  }

  stream(gymId: string, challengeId: string): Observable<MessageEvent> {
    const updates = this.pubsub.channel<ChallengeChange>(CHANNEL).pipe(
      filter((c) => c.gymId === gymId && c.challengeId === challengeId),
      throttleTime(THROTTLE_MS, undefined, { leading: true, trailing: true }),
      map((): MessageEvent => ({ type: 'update', data: { challengeId, at: new Date().toISOString() } })),
    );
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } })),
    );
    return merge(
      of<MessageEvent>({ type: 'ready', data: { challengeId } }),
      updates,
      heartbeat,
    );
  }
}
