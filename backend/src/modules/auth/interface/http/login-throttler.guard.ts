import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { LoginThrottler, loginSubject, userSubject } from '../../application/login-throttler';
import type { AuthenticatedRequest } from './decorators';

/** Who is being rate-limited: the signed-in user, or the login named in the request body. */
export function throttleSubject(request: AuthenticatedRequest): string {
    if (request.authUser !== undefined) return userSubject(request.authUser.id);
    const body = request.body as { login?: unknown } | undefined;
    return loginSubject(typeof body?.login === 'string' ? body.login : '');
}

export const clientIp = (request: AuthenticatedRequest): string => request.ip ?? 'unknown';

@Injectable()
export class LoginThrottlerGuard implements CanActivate {
    constructor(private readonly throttler: LoginThrottler) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        await this.throttler.acquire(throttleSubject(request), clientIp(request));
        return true;
    }
}
