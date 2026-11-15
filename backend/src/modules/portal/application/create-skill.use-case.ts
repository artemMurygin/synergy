import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgentNotFoundError } from '../domain/errors';
import { CatalogRepository } from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { SkillQuery } from '../domain/ports/skill-query.port';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { toSkillView, type SkillView } from './skill-view';

export interface CreateSkillInput {
    agentId: string;
    name: string;
    description: string;
}

@Injectable()
export class CreateSkillUseCase {
    constructor(
        private readonly skills: SkillRepository,
        private readonly catalog: CatalogRepository,
        private readonly query: SkillQuery,
        private readonly clock: Clock,
    ) {}

    async execute(input: CreateSkillInput): Promise<SkillView> {
        const name = SkillName.of(input.name);
        const agent = await this.catalog.findAgentForShare(input.agentId);
        if (agent === null) throw new AgentNotFoundError(input.agentId);
        agent.ensureActive();
        const skill = Skill.create({
            id: randomUUID(),
            agentId: agent.id,
            name,
            description: input.description,
            now: this.clock.now(),
        });
        await this.skills.save(skill);
        const view = await this.query.findView(skill.id);
        if (view === null) throw new Error(`Skill ${skill.id} disappeared after save`);
        return toSkillView(view);
    }
}
