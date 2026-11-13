import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { RequestRejectedEvent } from '../contracts/request-rejected.event';
import { RequestNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { RequestQuery } from '../domain/ports/request-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import type { RequestView } from './request-view';

export interface RejectRequestInput {
    requestId: string;
    decidedBy: string;
    reason: string;
}

@Injectable()
export class RejectRequestUseCase {
    constructor(
        private readonly requests: RequestRepository,
        private readonly query: RequestQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: RejectRequestInput): Promise<RequestView> {
        await this.transactions.run(async () => {
            const request = await this.requests.findById(input.requestId);
            if (request === null) throw new RequestNotFoundError(input.requestId);
            request.reject(input.reason, input.decidedBy, this.clock.now());
            await this.requests.save(request);
            const decision = request.decision;
            if (decision.kind !== 'rejected') throw new Error('Request must be rejected here');
            await this.events.publish([
                new RequestRejectedEvent({
                    aggregateId: request.id,
                    metadata: { userId: input.decidedBy },
                    authorId: request.authorId,
                    decidedBy: input.decidedBy,
                    reason: decision.reason,
                    requestTitle: request.title.value,
                }),
            ]);
        });
        const view = await this.query.findView(input.requestId);
        if (view === null) throw new RequestNotFoundError(input.requestId);
        return view;
    }
}
