import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../../auth/interface/http/decorators';
import { LinkTokenThrottler } from '../../application/link-token-throttler';
import { telegramActorOf } from './telegram-actor-of';

@Injectable()
export class LinkTokenThrottlerGuard implements CanActivate {
    constructor(private readonly throttler: LinkTokenThrottler) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        await this.throttler.acquire(telegramActorOf(request.authUser).userId);
        return true;
    }
}
