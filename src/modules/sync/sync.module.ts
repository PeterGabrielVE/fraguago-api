import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { MembersModule } from '../members/members.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [AuthModule, AttendanceModule, MembersModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
