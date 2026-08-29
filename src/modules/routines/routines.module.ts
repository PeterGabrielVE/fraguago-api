import { Module } from '@nestjs/common';
import { RoutinesService } from './routines.service';
import { RoutinesController } from './routines.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [RoutinesController], providers: [RoutinesService] })
export class RoutinesModule {}
