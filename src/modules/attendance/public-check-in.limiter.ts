import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Intentos fallidos (identificación inexistente) permitidos por IP y gym
// antes de bloquear, y cuánto dura la ventana/bloqueo.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;
// Tope de claves en memoria: si se supera, se purgan las vencidas.
const MAX_TRACKED_KEYS = 5000;

// Límites de volumen de la pantalla pública (se aplican por IP + gym).
export const PUBLIC_CHECK_IN_THROTTLERS = [
  // Ráfagas: doble clic repetido o un script disparando peticiones.
  { name: 'burst', ttl: 10_000, limit: 5 },
  // Sostenido: holgado para la hora pico de un kiosko compartido.
  { name: 'sustained', ttl: 60_000, limit: 30 },
];

// El contador va por IP y gym: un kiosko de un gym no consume el cupo de otro.
@Injectable()
export class PublicCheckInThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return `${req.ip}:${req.params?.gymId ?? ''}`;
  }
}

// Protecciones de la pantalla pública que el throttler no cubre. En memoria:
// suficiente con una sola instancia del API; con varias, cada una lleva su
// propia cuenta.
@Injectable()
export class PublicCheckInLimiter {
  private readonly failures = new Map<string, { count: number; resetAt: number }>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  // Lanza 429 si esta IP ya acumuló demasiados intentos fallidos en el gym.
  assertNotLocked(key: string) {
    const entry = this.failures.get(key);
    if (!entry) return;
    if (entry.resetAt <= Date.now()) {
      this.failures.delete(key);
      return;
    }
    if (entry.count >= MAX_FAILURES) {
      const minutes = Math.ceil((entry.resetAt - Date.now()) / 60_000);
      throw new HttpException(
        `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} min o pide ayuda en recepción.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // Un acierto no reinicia la cuenta: si no, bastaría intercalar una
  // identificación válida conocida para seguir probando números.
  recordFailure(key: string) {
    const now = Date.now();
    const entry = this.failures.get(key);
    if (entry && entry.resetAt > now) {
      entry.count += 1;
      return;
    }
    if (this.failures.size >= MAX_TRACKED_KEYS) this.prune(now);
    this.failures.set(key, { count: 1, resetAt: now + FAILURE_WINDOW_MS });
  }

  // Peticiones simultáneas con la misma clave (doble clic que llega a la vez)
  // comparten una sola ejecución y reciben el mismo resultado.
  once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;
    const promise = run().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, promise);
    return promise;
  }

  private prune(now: number) {
    for (const [key, entry] of this.failures) {
      if (entry.resetAt <= now) this.failures.delete(key);
    }
  }
}
