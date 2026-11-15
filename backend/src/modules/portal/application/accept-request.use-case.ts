import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { ArgumentInvalidError } from '../../../shared/errors';
import { DomainEventPublisherPort } from '../../../shared/ddd';
import { RequestAcceptedEvent } from '../contracts/request-accepted.event';
import { Agent } from '../domain/agent';
import { CatalogName } from '../domain/catalog-name';
import { EffortHours } from '../domain/effort-hours';
import {
    AgentNameTakenError,
    AgentNotFoundError,
    ProductNameTakenError,
    ProductNotFoundError,
    RequestNotFoundError,
    SkillArchivedError,
    SkillNotFoundError,
    SlugTakenError,
} from '../domain/errors';
import { CatalogRepository, type CatalogKind } from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import { RequestQuery } from '../domain/ports/request-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import { Product } from '../domain/product';
import { Skill } from '../domain/skill';
import { SkillName } from '../domain/skill-name';
import { Slug } from '../domain/slug';
import type { RequestView } from './request-view';

export type AcceptTarget =
    | { kind: 'existing_skill'; skillId: string }
    | { kind: 'new_skill'; agentId: string; name: string; description: string }
    | {
          kind: 'new_agent';
          agent: { name: string; productIds: readonly string[]; newProduct?: { name: string } };
          skill: { name: string; description: string };
      };

export interface AcceptRequestInput {
    requestId: string;
    decidedBy: string;
    effortHours: number;
    target: AcceptTarget;
}

/** Сколько раз подбирать slug при гонке за него (UNIQUE по slug). */
const SLUG_ATTEMPTS = 3;

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
            const effort = EffortHours.of(input.effortHours);
            // Статус проверяем до записей в каталог: заявка `new` или решённая не создаёт ничего.
            request.ensureUnderReview();
            const now = this.clock.now();
            const skill = await this.resolveSkill(input.target, now);
            request.accept(skill.id, effort, input.decidedBy, now);
            await this.requests.save(request, 'under_review');
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
                    effortHours: effort.value,
                }),
            ]);
        });
        const view = await this.query.findView(input.requestId);
        if (view === null) throw new RequestNotFoundError(input.requestId);
        return view;
    }

    private resolveSkill(target: AcceptTarget, now: Date): Promise<Skill> {
        switch (target.kind) {
            case 'existing_skill':
                return this.useExistingSkill(target.skillId);
            case 'new_skill':
                return this.createSkillForAgent(target, now);
            case 'new_agent':
                return this.createAgentWithSkill(target, now);
        }
    }

    private async useExistingSkill(skillId: string): Promise<Skill> {
        const existing = await this.skills.findForUpdate(skillId);
        if (existing === null) throw new SkillNotFoundError(skillId);
        if (existing.archivedAt !== null) throw new SkillArchivedError(existing.id);
        const owner = await this.catalog.findAgentForShare(existing.agentId);
        if (owner === null) throw new AgentNotFoundError(existing.agentId);
        owner.ensureActive();
        return existing;
    }

    private async createSkillForAgent(
        target: Extract<AcceptTarget, { kind: 'new_skill' }>,
        now: Date,
    ): Promise<Skill> {
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

    private async createAgentWithSkill(
        target: Extract<AcceptTarget, { kind: 'new_agent' }>,
        now: Date,
    ): Promise<Skill> {
        const agentName = CatalogName.of(target.agent.name);
        const newProductName =
            target.agent.newProduct === undefined
                ? null
                : CatalogName.of(target.agent.newProduct.name);
        const skillName = SkillName.of(target.skill.name);
        const productIds = [...new Set(target.agent.productIds)];
        if (productIds.length === 0 && newProductName === null) {
            throw new ArgumentInvalidError('Agent needs at least one product');
        }

        const found = await this.catalog.findProductsByIds(productIds);
        const foundIds = new Set(found.map((product) => product.id));
        const missing = productIds.find((id) => !foundIds.has(id));
        if (missing !== undefined) throw new ProductNotFoundError(missing);

        const linkedProductIds = [...productIds];
        if (newProductName !== null) {
            if ((await this.catalog.findProductByName(newProductName.key)) !== null) {
                throw new ProductNameTakenError();
            }
            const product = await this.createWithFreeSlug(
                'product',
                Slug.fromName(newProductName.value, 'product'),
                (slug) => {
                    const created = Product.create({
                        id: randomUUID(),
                        slug,
                        name: newProductName,
                    });
                    return this.catalog.insertProduct(created).then(() => created);
                },
            );
            linkedProductIds.push(product.id);
        }

        if ((await this.catalog.findAgentByName(agentName.key)) !== null) {
            throw new AgentNameTakenError();
        }
        const agent = await this.createWithFreeSlug(
            'agent',
            Slug.fromName(agentName.value, 'agent'),
            (slug) => {
                const created = Agent.create({
                    id: randomUUID(),
                    slug,
                    name: agentName.value,
                    productIds: linkedProductIds,
                    now,
                });
                return this.catalog.insertAgent(created).then(() => created);
            },
        );

        const skill = Skill.create({
            id: randomUUID(),
            agentId: agent.id,
            name: skillName,
            description: target.skill.description,
            now,
        });
        await this.skills.save(skill);
        return skill;
    }

    /**
     * Подбирает свободный slug и вставляет запись во вложенной транзакции (savepoint),
     * чтобы занятый slug не ломал внешнюю транзакцию; до `SLUG_ATTEMPTS` попыток.
     */
    private async createWithFreeSlug<T>(
        kind: CatalogKind,
        base: string,
        insert: (slug: string) => Promise<T>,
    ): Promise<T> {
        for (let attempt = 1; ; attempt += 1) {
            const slug = await this.catalog.nextFreeSlug(kind, base);
            try {
                return await this.transactions.run(() => insert(slug));
            } catch (error: unknown) {
                if (!(error instanceof SlugTakenError) || attempt >= SLUG_ATTEMPTS) throw error;
            }
        }
    }
}
