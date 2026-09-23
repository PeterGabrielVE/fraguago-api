import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AuthModule } from '../../auth/auth.module';
import { GamificationModule } from '../gamification/gamification.module';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [AuthModule, GamificationModule, ChallengesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
