import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { ScopedPrismaClient, TENANT_PRISMA } from '../../prisma/prisma.service';
import { GenerateRoutineDto } from './dto/generate-routine.dto';

@Injectable()
export class AiService {
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(@Inject(TENANT_PRISMA) private readonly prisma: ScopedPrismaClient) {
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

  // Arma un resumen breve y factual de la ficha médica + última medición del
  // socio, para que la IA adapte la rutina (intensidad, ejercicios a evitar)
  // sin necesidad de que el entrenador la reescriba a mano cada vez.
  private async buildHealthContext(gymId: string, memberId: string): Promise<string> {
    const [medical, latestMeasurement] = await Promise.all([
      this.prisma.medicalProfile.findFirst({ where: { memberId, gymId } }),
      this.prisma.measurement.findFirst({ where: { memberId, gymId }, orderBy: { date: 'desc' } }),
    ]);

    const conditions: string[] = [];
    if (medical?.hypertension) conditions.push('hipertensión');
    if (medical?.diabetes) conditions.push('diabetes');
    if (medical?.heartProblems) conditions.push('problemas cardíacos');
    if (medical?.asthma) conditions.push('asma');
    if (medical?.otherConditions) conditions.push(medical.otherConditions);
    if (medical?.hasInjury) conditions.push(`lesión (${medical.injuryDescription ?? 'sin detalle'})`);
    if (medical?.takesMedication) conditions.push(`medicación continua (${medical.medicationDescription ?? 'sin detalle'})`);

    const parts: string[] = [];
    if (conditions.length > 0) parts.push(`Condiciones reportadas: ${conditions.join('; ')}.`);
    if (latestMeasurement) {
      const m: string[] = [];
      if (latestMeasurement.weightKg) m.push(`peso ${latestMeasurement.weightKg}kg`);
      if (latestMeasurement.bodyFat) m.push(`grasa corporal ${latestMeasurement.bodyFat}%`);
      if (m.length > 0) parts.push(`Última medición: ${m.join(', ')}.`);
    }
    return parts.join(' ');
  }

  // Genera un borrador de rutina y lo DEVUELVE (no lo guarda). El entrenador
  // decide qué hacer con él.
  async generateRoutine(gymId: string, dto: GenerateRoutineDto) {
    const healthContext = dto.memberId ? await this.buildHealthContext(gymId, dto.memberId) : '';

    const system =
      'Sos un asistente para entrenadores de gimnasio. Generás BORRADORES ' +
      'de rutinas que SIEMPRE revisa un entrenador humano antes de aplicarse. ' +
      'No das consejos médicos. Si detectás una limitación que requiere ' +
      'criterio profesional, indicalo en el campo "notes". Si recibís datos ' +
      'de salud del socio, son confidenciales: usalos solo para ajustar ' +
      'intensidad y evitar ejercicios de riesgo, nunca los repitas tal cual ' +
      'ni des un diagnóstico.';

    const prompt =
      `Generá una rutina de entrenamiento.\n` +
      `Objetivo: ${dto.goal}.\n` +
      `Nivel: ${dto.level}.\n` +
      `Días por semana: ${dto.daysPerWeek}.\n` +
      `Consideraciones: ${dto.notes ?? 'ninguna'}.` +
      (healthContext ? `\nDatos de salud del socio: ${healthContext}` : '');

    const schema = {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        goal: { type: Type.STRING },
        daysPerWeek: { type: Type.INTEGER },
        days: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              day: { type: Type.INTEGER },
              focus: { type: Type.STRING },
              exercises: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    sets: { type: Type.INTEGER },
                    reps: { type: Type.STRING },
                    restSeconds: { type: Type.INTEGER },
                    notes: { type: Type.STRING },
                  },
                  required: ['name', 'sets', 'reps'],
                },
              },
            },
            required: ['day', 'focus', 'exercises'],
          },
        },
        notes: { type: Type.STRING },
      },
      required: ['name', 'goal', 'daysPerWeek', 'days'],
    };

    const draft = await this.generarJSON(system, prompt, schema);

    return {
      draft,
      generatedAt: new Date().toISOString(),
      _warning: 'Borrador generado por IA. Revisar antes de aplicar.',
    };
  }
}
