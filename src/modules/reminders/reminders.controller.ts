import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Role } from '@prisma/client';

@Controller('reminders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RemindersController {
  constructor(private readonly service: RemindersService) {}

  // The daily "who to charge" list, each with a ready-to-send WhatsApp link.
  // GET /api/reminders?days=7
  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.STAFF)
  list(
    @GymId() gymId: string, 
    @Query('days') days?: string
  ) {
    return this.service.buildForGym(gymId, days ? Number(days) : 7);
  }
}