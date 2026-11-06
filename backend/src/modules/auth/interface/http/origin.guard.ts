import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { isOriginAllowed } from '../../../../shared/http/origin-matcher';
import { ForbiddenOriginError } from '../../domain/errors';
import { AuthHttpSettings } from '../auth-http.settings';
import { resolveClientType } from './client-type';

/** CSRF defence for the cookie endpoints; desktop clients carry the token in the body, not a cookie. */
@Injectable()
export class OriginGuard implements CanActivate {
    constructor(private readonly settings: AuthHttpSettings) {}

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<Request>();
        if (resolveClientType(request) === 'desktop') return true;
        const origin = request.header('origin');
        if (origin === undefined || !isOriginAllowed(origin, this.settings.allowedOrigins)) {
            throw new ForbiddenOriginError();
        }
        return true;
    }
}
