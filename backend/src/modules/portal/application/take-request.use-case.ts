import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { RequestTakenEvent } from '../contracts/request-taken.event';
import { RequestNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { RequestQuery } from '../domain/ports/request-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import type { RequestView } from './request-view';

export interface TakeRequestInput {
    requestId: string;
    reviewerId: string;
}

/** Взять заявку в работу: `new` → `under_review`; гонку решает условный UPDATE в репозитории. */
@Injectable()
export class TakeRequestUseCase {
    constructor(
        private readonly requests: RequestRepository,
        private readonly query: RequestQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: TakeRequestInput): Promise<RequestView> {
        await this.transactions.run(async () => {
            const request = await this.requests.findById(input.requestId);
            if (request === null) throw new RequestNotFoundError(input.requestId);
            request.take(input.reviewerId, this.clock.now());
            await this.requests.save(request, 'new');
            await this.events.publish([
                new RequestTakenEvent({
                    aggregateId: request.id,
                    metadata: { userId: input.reviewerId },
                    authorId: request.authorId,
                    reviewerId: input.reviewerId,
                    requestTitle: request.title.value,
                }),
            ]);
        });
        const view = await this.query.findView(input.requestId);
        if (view === null) throw new RequestNotFoundError(input.requestId);
        return view;
    }
}
