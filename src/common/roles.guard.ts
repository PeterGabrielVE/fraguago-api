import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(), // decorador a nivel de método
      context.getClass(),   // decorador a nivel de controller
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    if (!user?.role) {
      throw new ForbiddenException('No role found on user');
    }

    if (user.role === Role.OWNER) return true;

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'No tenés permiso para acceder a este recurso',
      );
    }

    return true;
  }
}