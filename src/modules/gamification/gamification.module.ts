import { Module } from '@nestjs/common';
import { GamificationService } from './gamification.service';
import { RewardsService } from './rewards.service';
import { GamificationController } from './gamification.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GamificationController],
  providers: [GamificationService, RewardsService],
  exports: [GamificationService, RewardsService],
})
export class GamificationModule {}
