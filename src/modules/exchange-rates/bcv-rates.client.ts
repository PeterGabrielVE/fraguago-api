import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Currency } from '@prisma/client';

// Tasas oficiales del BCV expresadas como "bolívares por 1 unidad" de cada moneda.
export type BcvRates = {
  bsPer: Partial<Record<Currency, number>>;
  updatedAt: Date;
};

// Fuente pública (scraper del BCV). Se puede cambiar por env si el servicio se mueve.
const BCV_RATES_URL = process.env.BCV_RATES_URL || 'https://bcv.justcarlux.dev/api/v1/rates';
const TIMEOUT_MS = 8_000;
// La tasa cambia como mucho un par de veces al día: basta con pedirla cada pocos minutos.
const CACHE_MS = 10 * 60 * 1000;

@Injectable()
export class BcvRatesClient {
  private readonly logger = new Logger(BcvRatesClient.name);
  private cache: { at: number; value: BcvRates } | null = null;

  // Lanza ServiceUnavailableException si el servicio está caído o responde algo
  // inesperado: quien llama decide si sigue con la última tasa guardada.
  async fetchRates(force = false): Promise<BcvRates> {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;

    let body: unknown;
    try {
      const res = await fetch(BCV_RATES_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = await res.json();
    } catch (err) {
      this.logger.warn(`No se pudo consultar la tasa BCV: ${(err as Error)?.message ?? err}`);
      throw new ServiceUnavailableException('El servicio de tasas del BCV no está disponible. Registra la tasa manualmente.');
    }

    const value = this.parse(body);
    this.cache = { at: Date.now(), value };
    return value;
  }

  // Respuesta esperada: { rates: { usd: 859.06, eur: 973.31, ... }, updatedAt: <ms> }
  private parse(body: unknown): BcvRates {
    const data = body as { rates?: Record<string, unknown>; updatedAt?: unknown } | null;
    const usd = Number(data?.rates?.usd);
    const eur = Number(data?.rates?.eur);
    if (!(usd > 0)) {
      this.logger.warn(`Respuesta inesperada del servicio BCV: ${JSON.stringify(body)?.slice(0, 200)}`);
      throw new ServiceUnavailableException('El servicio de tasas del BCV devolvió datos inválidos. Registra la tasa manualmente.');
    }
    const updatedAtMs = Number(data?.updatedAt);
    return {
      bsPer: { VES: 1, USD: usd, ...(eur > 0 ? { EUR: eur } : {}) },
      updatedAt: Number.isFinite(updatedAtMs) && updatedAtMs > 0 ? new Date(updatedAtMs) : new Date(),
    };
  }
}

// Convierte "Bs por unidad" a la convención de ExchangeRate: cuántas unidades de
// `currency` equivalen a 1 unidad de la moneda base del gym.
//   base USD, VES → 859.06 (Bs por USD)       base USD, EUR → 859.06 / 973.31 = 0.8826
//   base VES, USD → 1 / 859.06                base EUR, VES → 973.31
export function rateAgainstBase(rates: BcvRates, base: Currency, currency: Currency): number | null {
  const bsPerBase = rates.bsPer[base];
  const bsPerCurrency = rates.bsPer[currency];
  if (!bsPerBase || !bsPerCurrency) return null;
  return Math.round((bsPerBase / bsPerCurrency) * 1e6) / 1e6;
}
