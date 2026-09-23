import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { AuthModule } from '../../auth/auth.module';
import { FinancesModule } from '../finances/finances.module';

@Module({ imports: [AuthModule, FinancesModule], controllers: [SalesController], providers: [SalesService] })
export class SalesModule {}
