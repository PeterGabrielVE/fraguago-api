import { Module } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { RoutinesController } from './routines.controller';
import { ExercisesService } from './exercises.service';
import { ExercisesController } from './exercises.controller';
import { AuthModule } from '../../auth/auth.module';
import { ChallengesModule } from '../challenges/challenges.module';

@Module({
  imports: [AuthModule, ChallengesModule],
  controllers: [RoutinesController, ExercisesController],
  providers: [RoutinesService, ExercisesService],
  exports: [RoutinesService],
})
export class RoutinesModule {}
