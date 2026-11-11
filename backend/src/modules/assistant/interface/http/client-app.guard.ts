import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ClientResolver } from './client-resolver';

/** Rejects a request whose X-Client-App header is unknown or claims to be Telegram, before any handler runs. */
@Injectable()
export class ClientAppGuard implements CanActivate {
    private readonly resolver = new ClientResolver();

    canActivate(context: ExecutionContext): boolean {
        this.resolver.resolve(context.switchToHttp().getRequest<Request>());
        return true;
    }
}
