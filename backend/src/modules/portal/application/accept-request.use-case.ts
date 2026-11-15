import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { RequestAcceptedEvent } from '../contracts/request-accepted.event';
import {
    AgentNotFoundError,
    RequestAlreadyDecidedError,
    RequestNotFoundError,
    SkillArchivedError,
    SkillNotFoundError,
} from '../domain/errors';
import { CatalogRepository } from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { RequestQuery } from '../domain/ports/request-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import type { RequestView } from './request-view';

export type AcceptTarget =
    { skillId: string } | { agentId: string; name: string; description: string };

export interface AcceptRequestInput {
    requestId: string;
    decidedBy: string;
    target: AcceptTarget;
}

@Injectable()
export class AcceptRequestUseCase {
    constructor(
        private readonly requests: RequestRepository,
        private readonly skills: SkillRepository,
        private readonly catalog: CatalogRepository,
        private readonly query: RequestQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: AcceptRequestInput): Promise<RequestView> {
        await this.transactions.run(async () => {
            const request = await this.requests.findById(input.requestId);
            if (request === null) throw new RequestNotFoundError(input.requestId);
            if (request.decision.kind !== 'pending') {
                throw new RequestAlreadyDecidedError(request.id);
            }
            const now = this.clock.now();
            const skill = await this.resolveSkill(input.target, now);
            request.accept(skill.id, input.decidedBy, now);
            await this.requests.save(request);
            await this.events.publish([
                new RequestAcceptedEvent({
                    aggregateId: request.id,
                    metadata: { userId: input.decidedBy },
                    authorId: request.authorId,
                    decidedBy: input.decidedBy,
                    requestTitle: request.title.value,
                    skillId: skill.id,
                    skillName: skill.name.value,
                    skillStatus: skill.status,
                }),
            ]);
        });
        const view = await this.query.findView(input.requestId);
        if (view === null) throw new RequestNotFoundError(input.requestId);
        return view;
    }

    private async resolveSkill(target: AcceptTarget, now: Date): Promise<Skill> {
        if ('skillId' in target) {
            const existing = await this.skills.findForUpdate(target.skillId);
            if (existing === null) throw new SkillNotFoundError(target.skillId);
            if (existing.archivedAt !== null) throw new SkillArchivedError(existing.id);
            const owner = await this.catalog.findAgentForShare(existing.agentId);
            if (owner === null) throw new AgentNotFoundError(existing.agentId);
            owner.ensureActive();
            return existing;
        }
        const name = SkillName.of(target.name);
        const agent = await this.catalog.findAgentForShare(target.agentId);
        if (agent === null) throw new AgentNotFoundError(target.agentId);
        agent.ensureActive();
        const skill = Skill.create({
            id: randomUUID(),
            agentId: agent.id,
            name,
            description: target.description,
            now,
        });
        await this.skills.save(skill);
        return skill;
    }
}
