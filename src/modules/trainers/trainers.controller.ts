import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TrainersService } from './trainers.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('trainers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrainersController {
  constructor(private readonly service: TrainersService) {}

  @Post()
  @Roles(Role.ADMIN) // Solo los administradores o dueños deberían contratar/crear entrenadores
  create(
    @GymId() gymId: string, 
    @Body() dto: any
  ) { 
    return this.service.create(gymId, dto); 
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER) // Todos necesitan ver la lista de entrenadores
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
  @Roles(Role.ADMIN) // Solo administradores actualizan salarios, roles o información crítica
  update(
    @GymId() gymId: string, 
    @Param('id') id: string, 
    @Body() dto: any
  ) { 
    return this.service.update(gymId, id, dto); 
  }

  @Delete(':id')
  @Roles(Role.ADMIN) // Solo Admin para evitar eliminar registros de empleados
  remove(
    @GymId() gymId: string, 
    @Param('id') id: string
  ) { 
    return this.service.remove(gymId, id); 
  }
}