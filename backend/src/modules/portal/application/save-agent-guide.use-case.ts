import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { AgentGuide } from '../domain/agent-guide';
import { AgentArchivedError, AgentNotFoundError } from '../domain/errors';
import { AgentGuideQuery } from '../domain/ports/agent-guide-query.port';
import { AgentGuideRepository } from '../domain/ports/agent-guide-repository.port';
import { CatalogRepository } from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { GuideBody } from '../domain/guide-body';
import { toGuideView, type GuideView } from './guide-view';

export interface SaveAgentGuideInput {
    agentId: string;
    actorId: string;
    body: string;
}

/** Запись инструкции целиком; пустое тело после trim удаляет её. Агент блокируется `FOR SHARE`. */
@Injectable()
export class SaveAgentGuideUseCase {
    constructor(
        private readonly catalog: CatalogRepository,
        private readonly guides: AgentGuideRepository,
        private readonly query: AgentGuideQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    async execute(input: SaveAgentGuideInput): Promise<GuideView> {
        await this.transactions.run(async () => {
            const agent = await this.catalog.findAgentForShare(input.agentId);
            if (agent === null) throw new AgentNotFoundError(input.agentId);
            if (agent.archivedAt !== null) throw new AgentArchivedError(agent.id);

            // Валидация длины до записи: ArgumentInvalidError откатывает транзакцию.
            if (GuideBody.of(input.body) === null) {
                await this.guides.delete(agent.id);
                return;
            }
            const guide = AgentGuide.write({
                agentId: agent.id,
                body: input.body,
                by: input.actorId,
                now: this.clock.now(),
            });
            if (guide === null) await this.guides.delete(agent.id);
            else await this.guides.upsert(guide);
        });
        return toGuideView(await this.query.find(input.agentId));
    }
}
