import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '../../domain/role';

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';
export const ALLOW_PENDING_PASSWORD_CHANGE = 'auth:allow-pending-password-change';

export interface AuthenticatedUser {
    id: string;
    sessionId: string;
    mustChangePassword: boolean;
    /** Roles from the access token claims. */
    roles: Role[];
}

export type AuthenticatedRequest = Request & { authUser?: AuthenticatedUser };

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export const AllowPendingPasswordChange = (): MethodDecorator & ClassDecorator =>
    SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

export const CurrentUser = createParamDecorator(
    (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
        context.switchToHttp().getRequest<AuthenticatedRequest>().authUser,
);

/** Restricts a handler or controller to users holding at least one of the roles (from token claims). */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
    SetMetadata(ROLES, roles);
