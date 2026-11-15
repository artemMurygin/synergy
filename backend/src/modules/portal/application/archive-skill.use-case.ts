import { Injectable } from '@nestjs/common';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { AgentNotFoundError, SkillNotFoundError } from '../domain/errors';
import { CatalogRepository } from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { SkillQuery } from '../domain/ports/skill-query.port';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import { toSkillView, type SkillView } from './skill-view';

/** Архивация и восстановление навыка; статус и событие смены статуса не затрагиваются. */
@Injectable()
export class ArchiveSkillUseCase {
    constructor(
        private readonly skills: SkillRepository,
        private readonly catalog: CatalogRepository,
        private readonly query: SkillQuery,
        private readonly clock: Clock,
        private readonly transactions: TransactionRunnerPort,
    ) {}

    archive(skillId: string): Promise<SkillView> {
        return this.apply(skillId, async (skill) => skill.archive(this.clock.now()));
    }

    restore(skillId: string): Promise<SkillView> {
        return this.apply(skillId, async (skill) => {
            // Неархивный навык: идемпотентно, агента не проверяем.
            if (skill.archivedAt === null) return false;
            // Порядок блокировок: навык (FOR UPDATE) -> агент (FOR SHARE).
            const agent = await this.catalog.findAgentForShare(skill.agentId);
            if (agent === null) throw new AgentNotFoundError(skill.agentId);
            agent.ensureActive();
            return skill.restore();
        });
    }

    private async apply(
        skillId: string,
        mutate: (
            skill: NonNullable<Awaited<ReturnType<SkillRepository['findForUpdate']>>>,
        ) => Promise<boolean>,
    ): Promise<SkillView> {
        await this.transactions.run(async () => {
            const skill = await this.skills.findForUpdate(skillId);
            if (skill === null) throw new SkillNotFoundError(skillId);
            const changed = await mutate(skill);
            if (changed) await this.skills.save(skill, skill.status);
        });
        const view = await this.query.findView(skillId);
        if (view === null) throw new SkillNotFoundError(skillId);
        return toSkillView(view);
    }
}
