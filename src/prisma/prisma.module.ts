import { Global, Module } from '@nestjs/common';
import {
  PrismaService,
  TENANT_PRISMA,
  withTenantScope,
} from './prisma.service';

/**
 * Modo estricto: SOLO se exporta TENANT_PRISMA.
 * PrismaService sigue siendo provider (el factory lo necesita y sus hooks abren
 * y cierran la conexión) pero NO se exporta, así ningún módulo puede inyectar el
 * cliente sin scope. Todo el CRUD pasa por TENANT_PRISMA.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: TENANT_PRISMA,
      inject: [PrismaService],
      useFactory: (base: PrismaService) => withTenantScope(base),
    },
  ],
  exports: [TENANT_PRISMA],
})
export class PrismaModule {}