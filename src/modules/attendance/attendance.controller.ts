import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { CheckInDto } from './dto/check-in.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}


  @Post('check-in')
  @Roles(Role.ADMIN, Role.STAFF)
  checkIn(@GymId() gymId: string, @Body() dto: CheckInDto) {
    return this.service.checkIn(gymId, dto.memberId);
  }


  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(
    @GymId() gymId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.findAll(
      gymId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  // --- Rutas estáticas ANTES de member/:memberId ---

  // B03 — GET /attendance/today
  @Get('today')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  today(@GymId() gymId: string) {
    return this.service.today(gymId);
  }

  // B05 — GET /attendance/summary
  @Get('summary')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  summary(@GymId() gymId: string) {
    return this.service.summary(gymId);
  }

  // B04 — GET /attendance/member/:memberId (paramétrica, va al final)
  @Get('member/:memberId')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  ofMember(@GymId() gymId: string, @Param('memberId') memberId: string) {
    return this.service.ofMember(gymId, memberId);
  }
}