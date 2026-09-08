import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HistoryController {
  constructor(private readonly service: HistoryService) {}

  @Get('member/:memberId')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  ofMember(
    @GymId() gymId: string, 
    @Param('memberId') memberId: string
  ) {
    return this.service.ofMember(gymId, memberId);
  }
}