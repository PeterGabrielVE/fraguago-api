import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [MembershipsController], providers: [MembershipsService] })
export class MembershipsModule {}
