import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { MembersModule } from '../members/members.module';
import { FinancesModule } from '../finances/finances.module';
import { ImportsService } from './imports.service';
import { ImportsController } from './imports.controller';

@Module({
  imports: [AuthModule, MembersModule, FinancesModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
