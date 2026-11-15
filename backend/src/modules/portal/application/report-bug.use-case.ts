import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { BugReportedEvent } from '../contracts/bug-reported.event';
import { BugDescription } from '../domain/bug-description';
import { BugReport } from '../domain/bug-report';
import { BugTitle } from '../domain/bug-title';
import {
    AgentNotFoundError,
    AgentNotInProductError,
    BugNotFoundError,
    ProductNotFoundError,
} from '../domain/errors';
import { BugQuery } from '../domain/ports/bug-query.port';
import { BugRepository } from '../domain/ports/bug-repository.port';
import { CatalogRepository } from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { toBugView, type BugView } from './bug-view';

export interface ReportBugInput {
    actorId: string;
    roles: readonly string[];
    title: string;
    description: string;
    productId: string;
    agentId: string;
}

/** Подача бага: пара (продукт, агент) проверяется здесь, агент читается с `FOR SHARE`. */
@Injectable()
export class ReportBugUseCase {
    constructor(
        private readonly bugs: BugRepository,
        private readonly catalog: CatalogRepository,
        private readonly query: BugQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: ReportBugInput): Promise<BugView> {
        const bugId = await this.transactions.run(async () => {
            const agent = await this.catalog.findAgentForShare(input.agentId);
            if (agent === null) throw new AgentNotFoundError(input.agentId);
            agent.ensureActive();
            const products = await this.catalog.findProductsByIds([input.productId]);
            const product = products.find((p) => p.id === input.productId);
            if (product === undefined) throw new ProductNotFoundError(input.productId);
            if (!agent.productIds.includes(product.id)) {
                throw new AgentNotInProductError(agent.id, product.id);
            }
            const bug = BugReport.report({
                id: randomUUID(),
                authorId: input.actorId,
                productId: product.id,
                agentId: agent.id,
                title: BugTitle.of(input.title),
                description: BugDescription.of(input.description),
                now: this.clock.now(),
            });
            bug.validate();
            await this.bugs.insert(bug);
            await this.events.publish([
                new BugReportedEvent({
                    aggregateId: bug.id,
                    metadata: { userId: input.actorId },
                    bugId: bug.id,
                    authorId: input.actorId,
                    title: bug.title.value,
                    productName: product.name,
                    agentName: agent.name,
                }),
            ]);
            return bug.id;
        });
        const record = await this.query.findView(bugId);
        if (record === null) throw new BugNotFoundError(bugId);
        return toBugView(record, input.roles);
    }
}
