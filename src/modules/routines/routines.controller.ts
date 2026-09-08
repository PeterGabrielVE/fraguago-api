import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('routines')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoutinesController {
  constructor(private readonly service: RoutinesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.TRAINER) // Entrenadores y Admin diseñan las rutinas
  create(
    @GymId() gymId: string, 
    @Body() dto: any
  ) { 
    return this.service.create(gymId, dto); 
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
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
  @Roles(Role.ADMIN, Role.TRAINER) // Entrenadores pueden modificar rutinas existentes
  update(
    @GymId() gymId: string, 
    @Param('id') id: string, 
    @Body() dto: any
  ) { 
    return this.service.update(gymId, id, dto); 
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TRAINER) // Entrenadores pueden eliminar rutinas que ya no usen
  remove(
    @GymId() gymId: string, 
    @Param('id') id: string
  ) { 
    return this.service.remove(gymId, id); 
  }
}