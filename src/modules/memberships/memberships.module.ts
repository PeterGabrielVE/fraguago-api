import { Module } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { AuthModule } from '../../auth/auth.module';
import { MemberMembershipsController } from './member-memberships.controller';

@Module({ imports: [AuthModule], controllers: [MembershipsController, MemberMembershipsController], providers: [MembershipsService] })
export class MembershipsModule {}
