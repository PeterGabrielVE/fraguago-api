import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma SOLO para autenticación. Conecta con el rol fraguago_auth
 * (BYPASSRLS), que puede leer/escribir identidad sin contexto de tenant.
 * Úsalo EXCLUSIVAMENTE en AuthService: login, registro de gym, refresh.
 * En cualquier otro sitio rompería el aislamiento.
 */
@Injectable()
export class AuthPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ datasources: { db: { url: process.env.AUTH_DATABASE_URL } } });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}