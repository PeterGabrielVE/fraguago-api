import { Module } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { ProgressController } from './progress.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [ProgressController], providers: [ProgressService] })
export class ProgressModule {}
