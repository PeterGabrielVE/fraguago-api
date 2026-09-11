import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    this.model = process.env.GEMINI_MODEL ?? 'gemini-flash-latest';
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async generarJSON<T>(
    systemInstruction: string,
    prompt: string,
    responseSchema: unknown,
  ): Promise<T> {
    const maxIntentos = 4;

    for (let intento = 1; intento <= maxIntentos; intento++) {
      try {
        const res = await this.client.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        return JSON.parse(res.text ?? '{}') as T;
      } catch (e: any) {
        const status = e?.status;

        // 503 (saturado) o 429 (rate limit) → esperamos y reintentamos.
        const esReintentable = status === 503 || status === 429;

        if (esReintentable && intento < maxIntentos) {
          // Espera progresiva: 1s, 2s, 4s (backoff exponencial).
          const espera = 1000 * Math.pow(2, intento - 1);
          console.warn(
            `⚠️ Gemini ${status}, reintentando en ${espera}ms (intento ${intento}/${maxIntentos})`,
          );
          await this.sleep(espera);
          continue;
        }

        // Error no reintentable, o se agotaron los intentos.
        console.error('🔴 ERROR GEMINI:', e);
        throw new InternalServerErrorException(
          status === 503
            ? 'El servicio de IA está saturado. Intentá de nuevo en unos segundos.'
            : 'No se pudo generar la rutina con IA. Intentá de nuevo.',
        );
      }
    }

    // Inalcanzable, pero TypeScript lo pide.
    throw new InternalServerErrorException('No se pudo generar la rutina con IA.');
  }
}