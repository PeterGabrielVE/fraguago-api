import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
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
// sale de la URL (su slug o, por compatibilidad, su id) y el socio se
// identifica con su número de identificación. El parámetro se llama gymId
// porque el guard de throttling lo usa para separar la cuenta por gym.
@Controller('public/attendance/:gymId')
@Public()
@UseGuards(PublicCheckInThrottlerGuard)
export class PublicAttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly limiter: PublicCheckInLimiter,
  ) {}

  // GET /public/attendance/:slug — nombre del gym para el encabezado.
  @Get()
  gym(@Param('gymId') gymRef: string) {
    return this.service.publicGym(gymRef);
  }

  // POST /public/attendance/:slug/check-in — el socio marca su entrada.
  @Post('check-in')
  async checkIn(
    @Param('gymId') gymRef: string,
    @Body() dto: PublicCheckInDto,
    @Req() req: Request,
  ) {
    // Las claves del limitador van con el id real: así da igual si el kiosko
    // entra por slug o por id, la cuenta de fallos es la misma.
    const { id: gymId } = await this.service.resolvePublicGym(gymRef);
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
