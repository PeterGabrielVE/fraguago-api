import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma para TRABAJOS DE SISTEMA (cronjobs, tareas de fondo)
 * que corren SIN request y por lo tanto SIN contexto de tenant.
 *
 * Conecta con el rol fraguago_auth (BYPASSRLS), así que ignora el RLS.
 * Por eso SIEMPRE hay que filtrar por gymId explícitamente en el código:
 * la base NO te protege acá. Usar solo en jobs que iteran gym por gym.
 */
@Injectable()
export class SystemPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ datasources: { db: { url: process.env.AUTH_DATABASE_URL } } });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}