import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import type { Agent } from '../domain/agent';
import { AgentNotFoundError } from '../domain/errors';
import { CatalogRepository } from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { toAgentView, type AgentView } from './agent-view';

/** Архивация и восстановление агента целиком; навыки агента не затрагиваются. */
@Injectable()
export class ArchiveAgentUseCase {
    constructor(
        private readonly catalog: CatalogRepository,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    archive(agentId: string): Promise<AgentView> {
        return this.apply(agentId, (agent) => agent.archive(this.clock.now()));
    }

    restore(agentId: string): Promise<AgentView> {
        return this.apply(agentId, (agent) => agent.restore());
    }

    private apply(agentId: string, mutate: (agent: Agent) => boolean): Promise<AgentView> {
        return this.transactions.run(async () => {
            const agent = await this.catalog.findAgentForUpdate(agentId);
            if (agent === null) throw new AgentNotFoundError(agentId);
            if (mutate(agent)) await this.catalog.saveAgent(agent);
            const products = await this.catalog.findProductsByIds(agent.productIds);
            return toAgentView(agent, products);
        });
    }
}
