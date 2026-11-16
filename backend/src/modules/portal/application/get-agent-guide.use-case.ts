import { Injectable } from '@nestjs/common';
import { AgentNotFoundError } from '../domain/errors';
import { AgentGuideQuery } from '../domain/ports/agent-guide-query.port';
import { CatalogRepository } from '../domain/ports/catalog-repository.port';
import { toGuideView, type GuideView } from './guide-view';

/** Чтение инструкции агента; агент в архиве недоступен так же, как несуществующий. */
@Injectable()
export class GetAgentGuideUseCase {
    constructor(
        private readonly catalog: CatalogRepository,
        private readonly guides: AgentGuideQuery,
    ) {}

    async execute(input: { agentId: string }): Promise<GuideView> {
        const agent = await this.catalog.findAgent(input.agentId);
        if (agent?.archivedAt !== null) {
            throw new AgentNotFoundError(input.agentId);
        }
        return toGuideView(await this.guides.find(input.agentId));
    }
}
