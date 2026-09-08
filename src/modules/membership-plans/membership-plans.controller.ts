import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { MembershipPlansService } from './membership-plans.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('membership-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipPlansController {
  constructor(private readonly service: MembershipPlansService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN) 
  create(
    @GymId() gymId: string, 
    @Body() dto: any
  ) { 
    return this.service.create(gymId, dto); 
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF, Role.TRAINER) // Todos pueden ver la lista de planes
  findAll(
    @GymId() gymId: string
  ) { 
    return this.service.findAll(gymId); 
  }

  @Get(':id')
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF, Role.TRAINER)
  findOne(
    @GymId() gymId: string, 
    @Param('id') id: string
  ) { 
    return this.service.findOne(gymId, id); 
  }

  @Patch(':id')
  @Roles(Role.OWNER, Role.ADMIN) // Solo administradores/dueños pueden editar planes
  update(
    @GymId() gymId: string, 
    @Param('id') id: string, 
    @Body() dto: any
  ) { 
    return this.service.update(gymId, id, dto); 
  }

  @Delete(':id')
  @Roles(Role.OWNER, Role.ADMIN) // Solo administradores/dueños pueden eliminar planes
  remove(
    @GymId() gymId: string, 
    @Param('id') id: string
  ) { 
    return this.service.remove(gymId, id); 
  }
}