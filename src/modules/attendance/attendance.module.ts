import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { PublicAttendanceController } from './public-attendance.controller';
import { OccupancyEventsService } from './occupancy-events.service';
import { PublicCheckInLimiter, PUBLIC_CHECK_IN_THROTTLERS } from './public-check-in.limiter';
import { AuthModule } from '../../auth/auth.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [
    AuthModule,
    GamificationModule,
    ChallengesModule,
    // Solo lo usa el guard de la pantalla pública (no es un guard global).
    ThrottlerModule.forRoot({
      throttlers: PUBLIC_CHECK_IN_THROTTLERS,
      errorMessage: 'Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo.',
    }),
  ],
  controllers: [AttendanceController, PublicAttendanceController],
  providers: [AttendanceService, OccupancyEventsService, PublicCheckInLimiter],
  exports: [AttendanceService, OccupancyEventsService],
})
export class AttendanceModule {}
