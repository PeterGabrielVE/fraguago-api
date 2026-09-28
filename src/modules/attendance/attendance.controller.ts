import {
  BadRequestException,
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { GymId } from '../../auth/decorators/gym-id.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AttendanceShift, Role } from '@prisma/client';
import { CheckInDto } from './dto/check-in.dto';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}


  @Post('check-in')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  checkIn(@GymId() gymId: string, @Body() dto: CheckInDto) {
    return this.service.checkIn(gymId, dto.memberId);
  }


  @Get()
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  findAll(
    @GymId() gymId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('date') date?: string,
    @Query('shift') shift?: AttendanceShift,
  ) {
    if (date && !DATE_RE.test(date)) {
      throw new BadRequestException('date debe tener el formato YYYY-MM-DD');
    }
    if (shift && !Object.values(AttendanceShift).includes(shift)) {
      throw new BadRequestException(
        `shift debe ser uno de: ${Object.values(AttendanceShift).join(', ')}`,
      );
    }

    return this.service.findAll(
      gymId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
      date,
      shift,
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

  // Aforo actual con la lista de quién está dentro.
  @Get('occupancy')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  occupancy(@GymId() gymId: string) {
    return this.service.occupancyDetail(gymId);
  }

  // Avisos en tiempo real de cambios en el aforo (entradas/salidas).
  @Sse('occupancy/stream')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  occupancyStream(@GymId() gymId: string): Observable<MessageEvent> {
    return this.service.occupancyStream(gymId);
  }

  @Post(':id/check-out')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  checkOut(@GymId() gymId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.checkOut(gymId, id);
  }

  // B04 — GET /attendance/member/:memberId (paramétrica, va al final)
  @Get('member/:memberId')
  @Roles(Role.ADMIN, Role.STAFF, Role.TRAINER)
  ofMember(@GymId() gymId: string, @Param('memberId') memberId: string) {
    return this.service.ofMember(gymId, memberId);
  }
}