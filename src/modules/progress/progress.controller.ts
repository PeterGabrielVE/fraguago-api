import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('progress')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgressController {
  constructor(private readonly service: ProgressService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER) // Los entrenadores suelen registrar el progreso
  create(
    @GymId() g: string, 
    @Body() dto: any
  ) { 
    return this.service.create(g, dto); 
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(
    @GymId() g: string
  ) { 
    return this.service.findAll(g); 
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(
    @GymId() g: string, 
    @Param('id') id: string
  ) { 
    return this.service.findOne(g, id); 
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER) // Entrenadores pueden necesitar corregir una medida mal ingresada
  update(
    @GymId() g: string, 
    @Param('id') id: string, 
    @Body() dto: any
  ) { 
    return this.service.update(g, id, dto); 
  }

  @Delete(':id')
  @Roles(Role.ADMIN) // Solo Admin puede borrar permanentemente un registro de progreso
  remove(
    @GymId() g: string, 
    @Param('id') id: string
  ) { 
    return this.service.remove(g, id); 
  }
}