import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

function contextFor(user?: { role: Role }): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new RolesGuard(reflector as unknown as Reflector);

  it('allows any authenticated user when the route has no @Roles()', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ role: Role.USER }))).toBe(true);
  });

  it('allows a user with a required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextFor({ role: Role.ADMIN }))).toBe(true);
  });

  it('denies a user without the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextFor({ role: Role.USER }))).toBe(false);
  });

  it('denies when no user is attached to the request', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);
    expect(guard.canActivate(contextFor(undefined))).toBe(false);
  });
});
