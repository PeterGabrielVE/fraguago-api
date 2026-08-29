import { Module } from '@nestjs/common';
import { FinancesService } from './finances.service';
import { FinancesController } from './finances.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [FinancesController], providers: [FinancesService] })
export class FinancesModule {}
