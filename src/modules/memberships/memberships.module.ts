import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { AuthModule } from '../../auth/auth.module';
import { MemberMembershipsController } from './member-memberships.controller';
import { FinancesModule } from '../finances/finances.module';

@Module({
  imports: [AuthModule, FinancesModule],
  controllers: [MembershipsController, MemberMembershipsController],
  providers: [MembershipsService],
})
export class MembershipsModule {}
