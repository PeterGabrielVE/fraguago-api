import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('memberships')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MembershipsController {
  constructor(private readonly service: MembershipsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF) // Staff y Admin son quienes venden/asignan membresías
  assign(
    @GymId() gymId: string, 
    @Body() dto: { memberId: string; planId: string; startDate?: string }
  ) {
    return this.service.assign(gymId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER) // Entrenadores pueden necesitar ver si un client está activo
  findAll(
    @GymId() gymId: string
  ) { 
    return this.service.findAll(gymId); 
  }

  // GET /api/memberships/expiring?days=7
  @Get('expiring')
  @Roles(Role.ADMIN, Role.STAFF) // Principalmente para recepción/ventas para seguimiento de renovaciones
  expiring(
    @GymId() gymId: string, 
    @Query('days') days?: string
  ) {
    return this.service.expiring(gymId, days ? Number(days) : 7);
  }
}