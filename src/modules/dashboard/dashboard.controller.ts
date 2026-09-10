import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Role } from '@prisma/client';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get() // GET /dashboard
  @Roles(Role.OWNER, Role.ADMIN)
  all(@GymId() gymId: string) {
    return this.service.all(gymId);
  }
  
  @Get('summary') // B01
  @Roles(Role.OWNER, Role.ADMIN)
  summary(@GymId() gymId: string) {
    return this.service.summary(gymId);
  }

  @Get('members') // B02
  @Roles(Role.OWNER, Role.ADMIN)
  members(@GymId() gymId: string) {
    return this.service.members(gymId);
  }

  @Get('attendance') // B03
  @Roles(Role.OWNER, Role.ADMIN)
  attendance(@GymId() gymId: string) {
    return this.service.attendance(gymId);
  }

  @Get('revenue') // B04
  @Roles(Role.OWNER, Role.ADMIN)
  revenue(@GymId() gymId: string) {
    return this.service.revenue(gymId);
  }

  @Get('expenses') // B05
  @Roles(Role.OWNER, Role.ADMIN)
  expenses(@GymId() gymId: string) {
    return this.service.expenses(gymId);
  }

  @Get('memberships') // B06
  @Roles(Role.OWNER, Role.ADMIN)
  memberships(@GymId() gymId: string) {
    return this.service.memberships(gymId);
  }

  @Get('sales') // B07
  @Roles(Role.OWNER, Role.ADMIN)
  sales(@GymId() gymId: string) {
    return this.service.sales(gymId);
  }
}