import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessTokenInvalidError } from '../../domain/errors';
import { AccessTokenService } from '../../domain/ports/access-token-service.port';
import { type AuthenticatedRequest, IS_PUBLIC } from './decorators';

const BEARER = /^Bearer (.+)$/i;

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly tokens: AccessTokenService,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic === true) return true;

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const token = BEARER.exec(request.headers.authorization ?? '')?.[1];
        if (token === undefined) throw new AccessTokenInvalidError();

        const claims = this.tokens.verify(token);
        request.authUser = {
            id: claims.sub,
            sessionId: claims.sid,
            mustChangePassword: claims.mcp,
        };
        return true;
    }
}
