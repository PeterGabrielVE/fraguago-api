import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantContext } from '../common/tenant/tenant.context';

/**
 * Token de inyección del cliente Prisma con scope de tenant.
 * Los servicios inyectan ESTE, no PrismaService, para todo el CRUD.
 */
export const TENANT_PRISMA = Symbol('TENANT_PRISMA');

/**
 * Envuelve un PrismaClient con una extensión que, en cada operación de modelo,
 * setea app.current_gym_id JUSTO ANTES de la query, dentro de una transacción.
 *
 * set_config(..., true) => variable TRANSACTION-LOCAL: se limpia en el COMMIT.
 * Eso hace seguro el pooling (la conexión vuelve al pool sin arrastrar el gymId
 * de la request anterior). Usamos `base` (sin extender) para el executeRaw y el
 * transaction, para no re-disparar la extensión (recursión). Sin contexto,
 * devolvemos la query tal cual: RLS la deniega (current_setting NULL) => 0 filas.
 */
export function withTenantScope(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const gymId = tenantContext.getStore()?.gymId;
          if (!gymId) {
            return query(args);
          }
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.current_gym_id', ${gymId}, true)`,
            query(args),
          ]);
          return result as unknown;
        },
      },
    },
  });
}

export type ScopedPrismaClient = ReturnType<typeof withTenantScope>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}