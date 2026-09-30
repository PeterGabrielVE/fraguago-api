import { Module } from '@nestjs/common';
import { ExchangeRatesController } from './exchange-rates.controller';
import { ExchangeRatesService } from './exchange-rates.service';
import { AuthModule } from '../../auth/auth.module';
import { SystemPrismaService } from '../../prisma/system-prisma.service';
import { BcvRatesClient } from './bcv-rates.client';
import { BcvSyncJob } from './bcv-sync.job';

@Module({
  imports: [AuthModule],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService, BcvRatesClient, BcvSyncJob, SystemPrismaService],
})
export class ExchangeRatesModule {}
