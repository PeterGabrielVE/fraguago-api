import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Role } from '@prisma/client';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('dashboard')
  @Roles(Role.OWNER, Role.ADMIN)
  dashboard(
    @GymId() gymId: string
  ) { 
    return this.service.dashboard(gymId); 
  }
}