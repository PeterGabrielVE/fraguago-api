import { Role } from "@prisma/client";

// De mayor a menor jerarquía: define el rol principal y el orden en que se
// muestran los roles al elegir con cuál entrar.
export const ROLE_PRIORITY: Role[] = [
  Role.OWNER,
  Role.ADMIN,
  Role.TRAINER,
  Role.STAFF,
  Role.MEMBER,
];

export const PRIVILEGED_ROLES: Role[] = [Role.OWNER, Role.ADMIN];

/** Sin duplicados y ordenados por jerarquía. */
export function normalizeRoles(roles: Role[]): Role[] {
  const set = new Set(roles);
  return ROLE_PRIORITY.filter((r) => set.has(r));
}

/**
 * Todos los roles del usuario. Incluye `role` para los usuarios creados por
 * flujos que solo escriben el rol principal (alta de socios, entrenadores,
 * seed), que quedan con `roles` vacío.
 */
export function userRoles(user: { role: Role; roles?: Role[] | null }): Role[] {
  return normalizeRoles([...(user.roles ?? []), user.role]);
}

/** Rol principal: el de mayor jerarquía. */
export function primaryRole(roles: Role[]): Role {
  return normalizeRoles(roles)[0];
}
