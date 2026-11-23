import { Role } from '../enums/role.enum';

/** The authenticated user attached to `request.user` by the JWT strategy. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}
