import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Shortcut to inject only the authenticated user's gymId into an endpoint.
export const GymId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user?.gymId,
);
