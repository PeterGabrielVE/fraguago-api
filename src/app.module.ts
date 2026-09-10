import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditInterceptor } from './common/audit.interceptor';

import { MembersModule } from './modules/members/members.module';
import { MembershipPlansModule } from './modules/membership-plans/membership-plans.module';
import { RoutinesModule } from './modules/routines/routines.module';
import { FinancesModule } from './modules/finances/finances.module';
import { ConceptsModule } from './modules/concepts/concepts.module';
import { ServicesModule } from './modules/services/services.module';
import { TrainersModule } from './modules/trainers/trainers.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { HistoryModule } from './modules/history/history.module';
import { LogsModule } from './modules/logs/logs.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { ProductsModule } from './modules/products/products.module';
import { SalesModule } from './modules/sales/sales.module';
import { ProgressModule } from './modules/progress/progress.module';
import { MembershipsModule } from './modules/memberships/memberships.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RemindersModule } from './modules/reminders/reminders.module';
import { HealthProfilesModule } from './modules/health-profiles/health-profiles.module';
import { TenantInterceptor } from './common/tenant/tenant.interceptor';
import { RolesGuard } from './common/roles.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    LogsModule,          // global: exposes LogsService to the interceptor
    MembersModule,
    MembershipPlansModule,
    RoutinesModule,
    FinancesModule,      // income + expenses unified
    ConceptsModule,
    ServicesModule,
    TrainersModule,
    SchedulesModule,
    HistoryModule,
    AttendanceModule,
    ProductsModule,
    SalesModule,
    ProgressModule,
    MembershipsModule,
    ReportsModule,
    RemindersModule,
    HealthProfilesModule,
    DashboardModule
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },   // 1º: puebla req.user
    { provide: APP_GUARD, useClass: RolesGuard },      // 2º: usa req.user
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor }, // auto-set tenant context
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }, // auto-audit all mutations
  ],
})
export class AppModule {}
