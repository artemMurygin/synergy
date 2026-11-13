import { AsyncLocalStorage } from 'node:async_hooks';
import type { CommonQueryMethods } from 'slonik';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort, type DomainEvent } from '../../../shared/ddd';
import type { LinkedRequestSnapshot } from '../contracts/linked-request-snapshot';
import type { Agent } from '../domain/agent';
import { InvalidSkillTransitionError, RequestAlreadyDecidedError } from '../domain/errors';
import type { IdeaRequest } from '../domain/idea-request';
import {
    CatalogRepository,
    type AgentWithProduct,
    type CatalogSeedProduct,
    type CatalogSeedResult,
} from '../domain/ports/catalog-repository.port';
import { Clock } from '../domain/ports/clock.port';
import type { Page, PageRequest } from '../domain/ports/page';
import { RequestQuery, type RequestView } from '../domain/ports/request-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { SkillQuery, type SkillView } from '../domain/ports/skill-query.port';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import type { Product } from '../domain/product';
import { RequestStatusPolicy } from '../domain/request-status-policy';
import type { Skill } from '../domain/skill';
import type { SkillStatus } from '../domain/skill-status';

export const NOW = new Date('2026-02-01T10:00:00Z');

export class FakeClock extends Clock {
    constructor(private current: Date = NOW) {
        super();
    }

    now(): Date {
        return this.current;
    }

    set(date: Date): void {
        this.current = date;
    }
}

export interface TransactionParticipant {
    snapshot(): () => void;
}

/** Фейковый `TransactionRunner`: при ошибке откатывает состояние участников. */
export class SnapshotTransactionRunner extends TransactionRunnerPort {
    private readonly storage = new AsyncLocalStorage<(() => void)[]>();

    commits = 0;

    rollbacks = 0;

    constructor(private readonly participants: readonly TransactionParticipant[]) {
        super();
    }

    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.storage.getStore() !== undefined) return work();
        const restores = this.participants.map((participant) => participant.snapshot());
        const callbacks: (() => void)[] = [];
        try {
            const result = await this.storage.run(callbacks, work);
            this.commits += 1;
            for (const callback of callbacks) callback();
            return result;
        } catch (error: unknown) {
            this.rollbacks += 1;
            for (const restore of restores) restore();
            throw error;
        }
    }

    executor(): CommonQueryMethods {
        throw new Error('SnapshotTransactionRunner has no database connection');
    }

    afterCommit(callback: () => void): void {
        const callbacks = this.storage.getStore();
        if (callbacks === undefined)
            throw new Error('afterCommit was called outside a transaction');
        callbacks.push(callback);
    }

    isInTransaction(): boolean {
        return this.storage.getStore() !== undefined;
    }
}

/** Фейковый outbox: события попадают в список и откатываются вместе с транзакцией. */
export class RecordingEventPublisher
    extends DomainEventPublisherPort
    implements TransactionParticipant
{
    published: DomainEvent[] = [];

    readonly publishedInTransaction: boolean[] = [];

    constructor(private readonly transactions: () => TransactionRunnerPort) {
        super();
    }

    snapshot(): () => void {
        const saved = [...this.published];
        return () => {
            this.published = saved;
        };
    }

    publish(events: readonly DomainEvent[]): Promise<void> {
        this.publishedInTransaction.push(this.transactions().isInTransaction());
        this.published.push(...events);
        return Promise.resolve();
    }
}

export class InMemoryRequestRepository extends RequestRepository implements TransactionParticipant {
    readonly byId = new Map<string, IdeaRequest>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, request] of saved) this.byId.set(id, request);
        };
    }

    save(request: IdeaRequest): Promise<void> {
        const stored = this.byId.get(request.id);
        if (stored !== undefined && stored !== request && stored.decision.kind !== 'pending') {
            return Promise.reject(new RequestAlreadyDecidedError(request.id));
        }
        this.byId.set(request.id, request);
        return Promise.resolve();
    }

    findById(id: string): Promise<IdeaRequest | null> {
        return Promise.resolve(this.byId.get(id) ?? null);
    }

    listLinkedToSkill(skillId: string): Promise<LinkedRequestSnapshot[]> {
        return Promise.resolve(
            [...this.byId.values()]
                .filter(
                    (request) =>
                        request.decision.kind === 'accepted' &&
                        request.decision.skillId === skillId,
                )
                .map((request) => ({
                    requestId: request.id,
                    authorId: request.authorId,
                    title: request.title.value,
                })),
        );
    }
}

export class InMemorySkillRepository extends SkillRepository implements TransactionParticipant {
    readonly byId = new Map<string, Skill>();

    /** Статус, как он «записан в БД»: объекты агрегатов общие, поэтому статус хранится отдельно. */
    private readonly persistedStatus = new Map<string, SkillStatus>();

    readonly lockedIds: string[] = [];

    snapshot(): () => void {
        const saved = new Map(this.byId);
        const savedStatus = new Map(this.persistedStatus);
        return () => {
            this.byId.clear();
            this.persistedStatus.clear();
            for (const [id, skill] of saved) this.byId.set(id, skill);
            for (const [id, status] of savedStatus) this.persistedStatus.set(id, status);
        };
    }

    findById(id: string): Promise<Skill | null> {
        return Promise.resolve(this.byId.get(id) ?? null);
    }

    findForUpdate(id: string): Promise<Skill | null> {
        this.lockedIds.push(id);
        return this.findById(id);
    }

    save(skill: Skill, expectedStatus?: SkillStatus): Promise<void> {
        if (expectedStatus !== undefined && this.persistedStatus.get(skill.id) !== expectedStatus) {
            return Promise.reject(new InvalidSkillTransitionError(expectedStatus, skill.status));
        }
        this.byId.set(skill.id, skill);
        this.persistedStatus.set(skill.id, skill.status);
        return Promise.resolve();
    }
}

export class InMemoryCatalogRepository extends CatalogRepository {
    readonly products = new Map<string, Product>();

    readonly agents = new Map<string, Agent>();

    addProduct(slug: string, name: string): Product {
        const product: Product = { id: `product-${slug}`, slug, name };
        this.products.set(slug, product);
        return product;
    }

    addAgent(productSlug: string, slug: string, name: string): Agent {
        const product = this.products.get(productSlug);
        if (product === undefined) throw new Error(`Unknown product ${productSlug}`);
        const agent: Agent = { id: `agent-${slug}`, productId: product.id, slug, name };
        this.agents.set(agent.id, agent);
        return agent;
    }

    listAgents(): Promise<AgentWithProduct[]> {
        const items: AgentWithProduct[] = [];
        for (const agent of this.agents.values()) {
            const product = [...this.products.values()].find((p) => p.id === agent.productId);
            if (product !== undefined) items.push({ agent, product });
        }
        return Promise.resolve(items);
    }

    findAgent(id: string): Promise<Agent | null> {
        return Promise.resolve(this.agents.get(id) ?? null);
    }

    seed(products: readonly CatalogSeedProduct[]): Promise<CatalogSeedResult> {
        const result = { productsCreated: 0, agentsCreated: 0 };
        for (const seedProduct of products) {
            if (!this.products.has(seedProduct.slug)) {
                this.addProduct(seedProduct.slug, seedProduct.name);
                result.productsCreated += 1;
            }
            for (const seedAgent of seedProduct.agents) {
                const exists = [...this.agents.values()].some(
                    (agent) => agent.slug === seedAgent.slug,
                );
                if (exists) continue;
                this.addAgent(seedProduct.slug, seedAgent.slug, seedAgent.name);
                result.agentsCreated += 1;
            }
        }
        return Promise.resolve(result);
    }
}

function paginate<T>(all: T[], page: PageRequest): Page<T> {
    const start = page.page * page.limit;
    return { items: all.slice(start, start + page.limit), total: all.length };
}

/** Read-модель в памяти: собирает вид из тех же in-memory репозиториев. */
export class InMemoryRequestQuery extends RequestQuery {
    /** Логины авторов; по умолчанию логин равен идентификатору. */
    readonly logins = new Map<string, string>();

    constructor(
        private readonly requests: InMemoryRequestRepository,
        private readonly skills: InMemorySkillRepository,
    ) {
        super();
    }

    private toView(request: IdeaRequest): RequestView {
        const decision = request.decision;
        const skill =
            decision.kind === 'accepted' ? this.skills.byId.get(decision.skillId) : undefined;
        return {
            id: request.id,
            authorId: request.authorId,
            authorLogin: this.logins.get(request.authorId) ?? request.authorId,
            title: request.title.value,
            description: request.description,
            frequency: { count: request.frequency.count, period: request.frequency.period },
            minutesPerRun: request.minutesPerRun,
            peopleCount: request.peopleCount,
            status: RequestStatusPolicy.statusOf(decision, skill?.status ?? null),
            rejectReason: decision.kind === 'rejected' ? decision.reason : null,
            skill:
                skill === undefined
                    ? null
                    : { id: skill.id, name: skill.name.value, description: skill.description },
            createdAt: request.createdAt,
        };
    }

    listByAuthor(authorId: string, page: PageRequest): Promise<Page<RequestView>> {
        const own = [...this.requests.byId.values()]
            .filter((request) => request.authorId === authorId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return Promise.resolve(
            paginate(
                own.map((request) => this.toView(request)),
                page,
            ),
        );
    }

    listPending(page: PageRequest): Promise<Page<RequestView>> {
        const pending = [...this.requests.byId.values()]
            .filter((request) => request.decision.kind === 'pending')
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return Promise.resolve(
            paginate(
                pending.map((request) => this.toView(request)),
                page,
            ),
        );
    }

    findView(id: string): Promise<RequestView | null> {
        const request = this.requests.byId.get(id);
        return Promise.resolve(request === undefined ? null : this.toView(request));
    }
}

export class InMemorySkillQuery extends SkillQuery {
    constructor(
        private readonly skills: InMemorySkillRepository,
        private readonly requests: InMemoryRequestRepository,
        private readonly catalog: InMemoryCatalogRepository,
    ) {
        super();
    }

    private toView(skill: Skill): SkillView | null {
        const agent = this.catalog.agents.get(skill.agentId);
        const product = [...this.catalog.products.values()].find((p) => p.id === agent?.productId);
        if (agent === undefined || product === undefined) return null;
        const linkedRequestCount = [...this.requests.byId.values()].filter(
            (request) =>
                request.decision.kind === 'accepted' && request.decision.skillId === skill.id,
        ).length;
        return {
            id: skill.id,
            name: skill.name.value,
            description: skill.description,
            status: skill.status,
            agent: { id: agent.id, name: agent.name },
            product: { id: product.id, name: product.name },
            linkedRequestCount,
            createdAt: skill.createdAt,
            statusChangedAt: skill.statusChangedAt,
        };
    }

    list(filter: { status?: SkillStatus }, page: PageRequest): Promise<Page<SkillView>> {
        const views = [...this.skills.byId.values()]
            .filter((skill) => filter.status === undefined || skill.status === filter.status)
            .sort((a, b) => b.statusChangedAt.getTime() - a.statusChangedAt.getTime())
            .map((skill) => this.toView(skill))
            .filter((view): view is SkillView => view !== null);
        return Promise.resolve(paginate(views, page));
    }

    findView(id: string): Promise<SkillView | null> {
        const skill = this.skills.byId.get(id);
        return Promise.resolve(skill === undefined ? null : this.toView(skill));
    }
}

export interface PortalFixture {
    clock: FakeClock;
    requests: InMemoryRequestRepository;
    skills: InMemorySkillRepository;
    catalog: InMemoryCatalogRepository;
    transactions: SnapshotTransactionRunner;
    events: RecordingEventPublisher;
    requestQuery: InMemoryRequestQuery;
    skillQuery: InMemorySkillQuery;
}

/** Полный набор двойников для тестов use case'ов портала. */
export function createPortalFixture(): PortalFixture {
    const clock = new FakeClock();
    const requests = new InMemoryRequestRepository();
    const skills = new InMemorySkillRepository();
    const catalog = new InMemoryCatalogRepository();
    // Раннер откатывает события, события спрашивают раннер: связываем через ссылку.
    const ref: { runner?: SnapshotTransactionRunner } = {};
    const events = new RecordingEventPublisher(() => {
        if (ref.runner === undefined) throw new Error('Fixture is not initialised');
        return ref.runner;
    });
    const transactions = new SnapshotTransactionRunner([requests, skills, events]);
    ref.runner = transactions;
    return {
        clock,
        requests,
        skills,
        catalog,
        transactions,
        events,
        requestQuery: new InMemoryRequestQuery(requests, skills),
        skillQuery: new InMemorySkillQuery(skills, requests, catalog),
    };
}
