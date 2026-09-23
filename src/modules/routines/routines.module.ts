import { Module } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { RoutinesController } from './routines.controller';
import { AuthModule } from '../../auth/auth.module';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [AuthModule, ChallengesModule],
  controllers: [RoutinesController],
  providers: [RoutinesService],
  exports: [RoutinesService],
})
export class RoutinesModule {}
