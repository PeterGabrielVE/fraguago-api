import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.STAFF) // El personal de recepción y administradores registran las ventas
  create(
    @GymId() gymId: string, 
    @Body() dto: { productId: string; quantity?: number; memberId?: string }
  ) {
    return this.service.create(gymId, dto);
  }

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF) // Dueños, admin y staff pueden ver el registro de ventas
  findAll(
    @GymId() gymId: string
  ) { 
    return this.service.findAll(gymId); 
  }
}