import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SystemPrismaService } from '../../prisma/system-prisma.service';
import { MessagingModule } from '../messaging/messaging.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { PaymentsModule } from '../payments/payments.module';
import { AutomationsService } from './automations.service';
import { RetentionController } from './retention.controller';
import { RetentionJob } from './retention.job';

@Module({
  imports: [AuthModule, MessagingModule, ReferralsModule, PaymentsModule],
  controllers: [RetentionController],
  providers: [AutomationsService, RetentionJob, SystemPrismaService],
})
export class RetentionModule {}
