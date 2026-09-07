import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  gymId: string;
}

export const tenantContext = new AsyncLocalStorage<TenantStore>();

export function getGymId(): string {
  const store = tenantContext.getStore();
  if (!store?.gymId) {
    throw new Error('getGymId() llamado fuera de un contexto de tenant');
  }
  return store.gymId;
}