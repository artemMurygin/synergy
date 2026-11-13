import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenInvalidError, ForbiddenError } from '../../domain/errors';
import type { Role } from '../../domain/role';
import { type AuthenticatedRequest, ROLES } from './decorators';

/** Runs after JwtAuthGuard: roles come from the token claims, never from the database. */
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (required === undefined || required.length === 0) return true;

        const user = context.switchToHttp().getRequest<AuthenticatedRequest>().authUser;
        if (user === undefined) throw new AccessTokenInvalidError();
        if (!required.some((role) => user.roles.includes(role))) throw new ForbiddenError();
        return true;
    }
}
