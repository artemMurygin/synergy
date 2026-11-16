import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { BugStatusChangedEvent } from '../contracts/bug-status-changed.event';
import type { BugStatus } from '../domain/bug-status';
import { BugNotFoundError, InvalidBugTransitionError } from '../domain/errors';
import { BugQuery } from '../domain/ports/bug-query.port';
import { BugRepository } from '../domain/ports/bug-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { toBugView, type BugView } from './bug-view';

export interface ChangeBugStatusInput {
    bugId: string;
    actorId: string;
    roles: readonly string[];
    status: BugStatus;
    reason: string | null;
}

/**
 * Смена статуса бага. Роль `developer` проверяет контроллер; гонку решает условный UPDATE:
 * `false` означает, что статус уже изменён, — 409 без блокировок.
 */
@Injectable()
export class ChangeBugStatusUseCase {
    constructor(
        private readonly bugs: BugRepository,
        private readonly query: BugQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: ChangeBugStatusInput): Promise<BugView> {
        await this.transactions.run(async () => {
            const bug = await this.bugs.findById(input.bugId);
            if (bug === null) throw new BugNotFoundError(input.bugId);
            const from = bug.changeStatus(
                input.status,
                input.actorId,
                input.reason,
                this.clock.now(),
            );
            bug.validate();
            const updated = await this.bugs.updateStatus(bug, from);
            if (!updated) throw new InvalidBugTransitionError(from, input.status);
            await this.events.publish([
                new BugStatusChangedEvent({
                    aggregateId: bug.id,
                    metadata: { userId: input.actorId },
                    bugId: bug.id,
                    authorId: bug.authorId,
                    changedBy: input.actorId,
                    title: bug.title.value,
                    from,
                    to: input.status,
                    reason: bug.wontFixReason?.value ?? null,
                }),
            ]);
        });
        const record = await this.query.findView(input.bugId);
        if (record === null) throw new BugNotFoundError(input.bugId);
        return toBugView(record, input.roles);
    }
}
