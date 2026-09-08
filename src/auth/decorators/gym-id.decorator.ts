import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

/**
 * Inyecta el gymId del usuario autenticado (viene del JWT, no del cliente).
 * Si falta, lanza 500: es un bug (el guard debió bloquear antes), y preferimos
 * fallar ruidosamente que devolver undefined y arriesgar una query sin filtro
 * de tenant (Prisma ignora `where: { gymId: undefined }` → fuga cross-tenant).
 */
export const GymId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const gymId = ctx.switchToHttp().getRequest().user?.gymId;
    if (!gymId) {
      throw new InternalServerErrorException('gymId missing from token');
    }
    return gymId;
  },
);