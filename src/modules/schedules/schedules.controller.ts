import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF) // Admin y Staff gestionan la creación de horarios/clases
  create(
    @GymId() gymId: string, 
    @Body() dto: any
  ) { 
    return this.service.create(gymId, dto); 
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER) // Todos necesitan ver los horarios
  findAll(
    @GymId() gymId: string
  ) { 
    return this.service.findAll(gymId); 
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(
    @GymId() gymId: string, 
    @Param('id') id: string
  ) { 
    return this.service.findOne(gymId, id); 
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF) // Admin y Staff pueden actualizar horas o instructores
  update(
    @GymId() gymId: string, 
    @Param('id') id: string, 
    @Body() dto: any
  ) { 
    return this.service.update(gymId, id, dto); 
  }

  @Delete(':id')
  @Roles(Role.ADMIN) // Solo Admin para evitar borrados accidentales de clases/horarios
  remove(
    @GymId() gymId: string, 
    @Param('id') id: string
  ) { 
    return this.service.remove(gymId, id); 
  }
}