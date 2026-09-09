import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthPrismaService } from './auth-prisma.service';
import { PasswordService } from './password.service';
import { AuthAuditService } from './auth-audit.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthPrismaService,
    PasswordService,
    AuthAuditService,
  ],
  exports: [AuthService],
})
export class AuthModule {}