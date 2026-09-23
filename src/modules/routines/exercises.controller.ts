import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ExercisesService } from './exercises.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateExerciseDto, SearchExercisesDto, UpdateExerciseDto } from './dto/exercise.dto';

// DB-06 — catálogo de ejercicios (mismos roles que gestionan rutinas).
@Controller('exercises')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExercisesController {
  constructor(private readonly service: ExercisesService) {}

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(@GymId() gymId: string, @Query() query: SearchExercisesDto) {
    return this.service.findAll(gymId, query.q);
  }

  @Post()
  @Roles(Role.ADMIN, Role.TRAINER)
  create(@GymId() gymId: string, @Body() dto: CreateExerciseDto) {
    return this.service.create(gymId, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TRAINER)
  update(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExerciseDto) {
    return this.service.update(gymId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TRAINER)
  remove(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(gymId, id);
  }
}
