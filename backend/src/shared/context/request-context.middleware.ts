import type { IncomingMessage, ServerResponse } from 'node:http';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import { RequestContext } from './request-context';
import { resolveRequestIds } from './request-id';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    use(req: IncomingMessage, res: ServerResponse, next: () => void): void {
        RequestContext.run(resolveRequestIds(req, res), next);
    }
}
