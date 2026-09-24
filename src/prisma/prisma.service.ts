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
function scopeQueries(base: PrismaClient) {
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

/**
 * Transacciones INTERACTIVAS (`$transaction(async (tx) => …)`): la extensión
 * de arriba envuelve cada query en su propia mini-transacción, así que dentro
 * de un callback cada operación se confirmaba sola y un error NO revertía lo
 * anterior (p. ej. quedaba la membresía creada aunque el pago fallara).
 *
 * Por eso se intercepta $transaction(fn): se abre UNA transacción real en el
 * cliente base, se fija app.current_gym_id una vez (SET LOCAL, muere con el
 * COMMIT/ROLLBACK) y el callback recibe ese cliente de transacción, cuyas
 * queries corren en la misma conexión — RLS sigue aplicando y el ROLLBACK
 * deshace todo. La forma en lote ($transaction([...])) no cambia.
 */
export function withTenantScope(base: PrismaClient) {
  const scoped = scopeQueries(base);
  return new Proxy(scoped, {
    get(target, prop) {
      if (prop !== '$transaction') return Reflect.get(target, prop);
      return (arg: unknown, options?: Parameters<PrismaClient['$transaction']>[1]) => {
        if (typeof arg !== 'function') {
          return (target.$transaction as (a: unknown, o?: unknown) => unknown)(arg, options);
        }
        const gymId = tenantContext.getStore()?.gymId;
        return base.$transaction(async (tx) => {
          if (gymId) {
            await tx.$executeRaw`SELECT set_config('app.current_gym_id', ${gymId}, true)`;
          }
          return (arg as (client: unknown) => Promise<unknown>)(tx);
        }, options);
      };
    },
  }) as typeof scoped;
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