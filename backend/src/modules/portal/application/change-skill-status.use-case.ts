import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { SkillStatusChangedEvent } from '../contracts/skill-status-changed.event';
import { SkillNotFoundError } from '../domain/errors';
import { Clock } from '../domain/ports/clock.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { SkillQuery } from '../domain/ports/skill-query.port';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import type { SkillStatus } from '../domain/skill-status';
import type { SkillView } from './skill-view';

export interface ChangeSkillStatusInput {
    skillId: string;
    to: SkillStatus;
    changedBy: string;
}

@Injectable()
export class ChangeSkillStatusUseCase {
    constructor(
        private readonly skills: SkillRepository,
        private readonly requests: RequestRepository,
        private readonly query: SkillQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
        private readonly events: DomainEventPublisherPort,
    ) {}

    async execute(input: ChangeSkillStatusInput): Promise<SkillView> {
        await this.transactions.run(async () => {
            const skill = await this.skills.findForUpdate(input.skillId);
            if (skill === null) throw new SkillNotFoundError(input.skillId);
            const from = skill.status;
            skill.advance(input.to, this.clock.now());
            const linked = await this.requests.listLinkedToSkill(skill.id);
            await this.skills.save(skill, from);
            await this.events.publish([
                new SkillStatusChangedEvent({
                    aggregateId: skill.id,
                    metadata: { userId: input.changedBy },
                    skillName: skill.name.value,
                    from,
                    to: input.to,
                    changedBy: input.changedBy,
                    linked,
                }),
            ]);
        });
        const view = await this.query.findView(input.skillId);
        if (view === null) throw new SkillNotFoundError(input.skillId);
        return view;
    }
}
