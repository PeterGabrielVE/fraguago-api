import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject, filter, interval, map, merge, of, throttleTime } from 'rxjs';

type ChallengeChange = { gymId: string; challengeId: string };

// Cada 25s se manda un ping para que proxies/load balancers no corten el stream.
const HEARTBEAT_MS = 25_000;
// Agrupa ráfagas (p. ej. varios check-ins seguidos) en un aviso por segundo.
const THROTTLE_MS = 1_000;

// COM-F02 — bus en memoria de "cambió el leaderboard de un reto". El stream
// SSE solo avisa; el cliente vuelve a pedir el leaderboard por la API normal,
// así el tiempo real reutiliza la misma autorización y lógica de ranking.
//
// Limitación: vive en el proceso. Con varias instancias del API detrás de un
// balanceador habría que reemplazar el Subject por Redis pub/sub o similar.
@Injectable()
export class ChallengeEventsService {
  private readonly changes = new Subject<ChallengeChange>();

  emit(gymId: string, challengeId: string) {
    this.changes.next({ gymId, challengeId });
  }

  stream(gymId: string, challengeId: string): Observable<MessageEvent> {
    const updates = this.changes.pipe(
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
