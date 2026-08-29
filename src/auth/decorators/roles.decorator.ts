import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
// Usage: @Roles('OWNER', 'ADMIN') on an endpoint only those roles may touch.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
