import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AttendanceService } from './attendance.service';
import { Public } from '../../auth/decorators/public.decorator';
import { PublicCheckInDto } from './dto/public-check-in.dto';
import { PublicCheckInLimiter, PublicCheckInThrottlerGuard } from './public-check-in.limiter';

// Pantalla pública de asistencia (kiosko en la recepción). Sin token: el gym
// sale de la URL y el socio se identifica con su número de identificación.
@Controller('public/attendance/:gymId')
@Public()
@UseGuards(PublicCheckInThrottlerGuard)
export class PublicAttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly limiter: PublicCheckInLimiter,
  ) {}

  // GET /public/attendance/:gymId — nombre del gym para el encabezado.
  @Get()
  gym(@Param('gymId', ParseUUIDPipe) gymId: string) {
    return this.service.publicGym(gymId);
  }

  // POST /public/attendance/:gymId/check-in — el socio marca su entrada.
  @Post('check-in')
  async checkIn(
    @Param('gymId', ParseUUIDPipe) gymId: string,
    @Body() dto: PublicCheckInDto,
    @Req() req: Request,
  ) {
    const clientKey = `${req.ip}:${gymId}`;
    this.limiter.assertNotLocked(clientKey);

    try {
      return await this.limiter.once(`${gymId}:${dto.identificationNumber}`, () =>
        this.service.publicCheckIn(gymId, dto.identificationNumber),
      );
    } catch (err) {
      // Solo cuenta como fallo la identificación inexistente (posible barrido
      // de números); membresía vencida o aforo lleno son de un socio real.
      if (err instanceof NotFoundException) this.limiter.recordFailure(clientKey);
      throw err;
    }
  }
}
