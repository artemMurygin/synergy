import { Injectable } from '@nestjs/common';
import { RequestNotFoundError } from '../domain/errors';
import { RequestQuery } from '../domain/ports/request-query.port';
import { RequestAccessPolicy } from '../domain/request-access-policy';
import type { RequestView } from './request-view';

export interface GetRequestInput {
    actorId: string;
    roles: readonly string[];
    requestId: string;
}

@Injectable()
export class GetRequestUseCase {
    constructor(private readonly query: RequestQuery) {}

    /** Автор или `developer`; для остальных чужая заявка неотличима от несуществующей. */
    async execute(input: GetRequestInput): Promise<RequestView> {
        const view = await this.query.findView(input.requestId);
        if (view === null) throw new RequestNotFoundError(input.requestId);
        const allowed = RequestAccessPolicy.canView(view, {
            id: input.actorId,
            roles: input.roles,
        });
        if (!allowed) throw new RequestNotFoundError(input.requestId);
        return view;
    }
}
