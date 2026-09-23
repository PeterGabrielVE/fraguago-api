import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { AuthModule } from '../../auth/auth.module';
import { MemberMembershipsController } from './member-memberships.controller';
import { FinancesModule } from '../finances/finances.module';
import { ReferralsModule } from '../referrals/referrals.module';

@Module({
  imports: [AuthModule, FinancesModule, ReferralsModule],
  controllers: [MembershipsController, MemberMembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
