import { Controller, Get, UseGuards } from '@nestjs/common';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Role } from '@prisma/client';

@Controller('logs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogsController {
  constructor(private readonly service: LogsService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN) 
  findAll(
    @GymId() gymId: string
  ) { 
    return this.service.findAll(gymId); 
  }
}