import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Post('check-in')
  @Roles(Role.ADMIN, Role.STAFF)
  checkIn(
    @GymId() gymId: string, 
    @Body('memberId') memberId: string
  ) {
    return this.service.checkIn(gymId, memberId);
  }

  @Get('today')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  today(
    @GymId() gymId: string
  ) { 
    return this.service.today(gymId); 
  }

  @Get('member/:memberId')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  ofMember(
    @GymId() gymId: string, 
    @Param('memberId') memberId: string
  ) {
    return this.service.ofMember(gymId, memberId);
  }
}