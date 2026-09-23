import { Module } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { ChallengeEventsService } from './challenge-events.service';
import { ChallengesController } from './challenges.controller';
import { AuthModule } from '../../auth/auth.module';
import { GamificationModule } from '../gamification/gamification.module';

@Module({
  imports: [AuthModule, GamificationModule],
  controllers: [ChallengesController],
  providers: [ChallengesService, ChallengeEventsService],
  exports: [ChallengesService, ChallengeEventsService],
})
export class ChallengesModule {}
