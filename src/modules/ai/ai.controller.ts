import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
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
  generateRoutine(@GymId() gymId: string, @Body() dto: GenerateRoutineDto) {
    return this.ai.generateRoutine(gymId, dto);
  }
}