import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('services')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF) // Admin y Staff registran los nuevos servicios disponibles
  create(
    @GymId() gymId: string, 
    @Body() dto: any
  ) { 
    return this.service.create(gymId, dto); 
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER) // Todos pueden ver la lista de servicios para ofrecerlos
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
  @Roles(Role.ADMIN, Role.STAFF) // Permite al Staff y Admin ajustar precios o características
  update(
    @GymId() gymId: string, 
    @Param('id') id: string, 
    @Body() dto: any
  ) { 
    return this.service.update(gymId, id, dto); 
  }

  @Delete(':id')
  @Roles(Role.ADMIN) // Restringido solo a Admin para evitar borrado accidental
  remove(
    @GymId() gymId: string, 
    @Param('id') id: string
  ) { 
    return this.service.remove(gymId, id); 
  }
}