import { Module } from '@nestjs/common';
import { HealthProfilesService } from './health-profiles.service';
import { HealthProfilesController } from './health-profiles.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [HealthProfilesController],
  providers: [HealthProfilesService],
})
export class HealthProfilesModule {}