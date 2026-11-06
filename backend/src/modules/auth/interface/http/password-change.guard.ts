import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenInvalidError, PasswordChangeRequiredError } from '../../domain/errors';
import { ALLOW_PENDING_PASSWORD_CHANGE, type AuthenticatedRequest, IS_PUBLIC } from './decorators';

@Injectable()
export class PasswordChangeGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const targets = [context.getHandler(), context.getClass()];
        if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets) === true) {
            return true;
        }
        if (
            this.reflector.getAllAndOverride<boolean | undefined>(
                ALLOW_PENDING_PASSWORD_CHANGE,
                targets,
            ) === true
        ) {
            return true;
        }
        const user = context.switchToHttp().getRequest<AuthenticatedRequest>().authUser;
        if (user === undefined) throw new AccessTokenInvalidError();
        if (user.mustChangePassword) throw new PasswordChangeRequiredError();
        return true;
    }
}
