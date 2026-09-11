import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Type } from '@google/genai';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { GenerateRoutineDto } from './dto/generate-routine.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  // Genera un borrador de rutina y lo DEVUELVE (no lo guarda).
  // El entrenador decide qué hacer con él.
  @Post('routines/generate')
  @Roles(Role.ADMIN, Role.TRAINER)
  async generateRoutine(@Body() dto: GenerateRoutineDto) {
    const system =
      'Sos un asistente para entrenadores de gimnasio. Generás BORRADORES ' +
      'de rutinas que SIEMPRE revisa un entrenador humano antes de aplicarse. ' +
      'No das consejos médicos. Si detectás una limitación que requiere ' +
      'criterio profesional, indicalo en el campo "notes".';

    const prompt =
      `Generá una rutina de entrenamiento.\n` +
      `Objetivo: ${dto.goal}.\n` +
      `Nivel: ${dto.level}.\n` +
      `Días por semana: ${dto.daysPerWeek}.\n` +
      `Consideraciones: ${dto.notes ?? 'ninguna'}.`;

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

    const draft = await this.ai.generarJSON(system, prompt, schema);

    return {
      draft,
      generatedAt: new Date().toISOString(),
      _warning: 'Borrador generado por IA. Revisar antes de aplicar.',
    };
  }
}