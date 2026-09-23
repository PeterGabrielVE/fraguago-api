import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { MembershipsModule } from '../modules/memberships/memberships.module';
import { AttendanceModule } from '../modules/attendance/attendance.module';
import { RoutinesModule } from '../modules/routines/routines.module';
import { ProgressModule } from '../modules/progress/progress.module';
import { GamificationModule } from '../modules/gamification/gamification.module';
import { ChallengesModule } from '../modules/challenges/challenges.module';
import { ReferralsModule } from '../modules/referrals/referrals.module';

// Portal de autoservicio para socios (Role.MEMBER). No duplica lógica de
// negocio: reutiliza los servicios ya existentes de cada módulo, resolviendo
// siempre memberId/userId desde el JWT (nunca desde el body/query del cliente).
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MembershipsModule,
    AttendanceModule,
    RoutinesModule,
    ProgressModule,
    GamificationModule,
    ChallengesModule,
    ReferralsModule,
  ],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
