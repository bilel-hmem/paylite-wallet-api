import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from '../interfaces/auth-user.interface';

/** Injects the authenticated user: `me(@CurrentUser() user: AuthUser)`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return request.user;
});
