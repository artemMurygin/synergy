import { AsyncLocalStorage } from 'node:async_hooks';
import type { CommonQueryMethods } from 'slonik';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort, type DomainEvent } from '../../../shared/ddd';
import { formatFullName, type FullNameParts } from '../../../shared/people/full-name';
import { BugReport } from '../domain/bug-report';
import type { BugStatus } from '../domain/bug-status';
import {
    BugQuery,
    type BugListRecord,
    type BugPerson,
    type BugRecord,
} from '../domain/ports/bug-query.port';
import { BugRepository } from '../domain/ports/bug-repository.port';
import type { LinkedRequestSnapshot } from '../contracts/linked-request-snapshot';
import { Agent } from '../domain/agent';
import {
    AgentNameTakenError,
    InvalidSkillTransitionError,
    ProductNameTakenError,
    RequestAlreadyDecidedError,
    RequestAlreadyTakenError,
    RequestNotFoundError,
    RequestNotTakenError,
    SlugTakenError,
} from '../domain/errors';
import type { IdeaRequest } from '../domain/idea-request';
import {
    CatalogRepository,
    type AgentWithProducts,
    type CatalogKind,
    type CatalogSeedProduct,
    type CatalogSeedResult,
} from '../domain/ports/catalog-repository.port';
import {
    CatalogQuery,
    type ArchiveRows,
    type CatalogRow,
} from '../domain/ports/catalog-query.port';
import { CommentQuery, type CommentRecord } from '../domain/ports/comment-query.port';
import { CommentRepository } from '../domain/ports/comment-repository.port';
import { Clock } from '../domain/ports/clock.port';
import type { RequestComment } from '../domain/request-comment';
import type { Page, PageRequest } from '../domain/ports/page';
import { RequestQuery, type RequestView } from '../domain/ports/request-query.port';
import { RequestRepository } from '../domain/ports/request-repository.port';
import { SkillQuery, type SkillView } from '../domain/ports/skill-query.port';
import { SkillRepository } from '../domain/ports/skill-repository.port';
import type { Product } from '../domain/product';
import type { RequestStatusKind } from '../domain/request-decision';
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

interface SnapshotTransactionScope {
    readonly callbacks: (() => void)[];
    isAborted: boolean;
}

export class TransactionAbortedError extends Error {}

/**
 * Как PostgreSQL: ошибка из вложенного `run` (без SAVEPOINT), перехваченная кодом, прерывает
 * всю транзакцию, и коммит падает. Откатить часть работы может только `savepoint`.
 */
export class SnapshotTransactionRunner extends TransactionRunnerPort {
    private readonly storage = new AsyncLocalStorage<SnapshotTransactionScope>();

    commits = 0;

    rollbacks = 0;

    savepointRollbacks = 0;

    constructor(private readonly participants: readonly TransactionParticipant[]) {
        super();
    }

    async run<T>(work: () => Promise<T>): Promise<T> {
        const parent = this.storage.getStore();
        if (parent !== undefined) {
            try {
                return await work();
            } catch (error: unknown) {
                parent.isAborted = true;
                throw error;
            }
        }
        const restores = this.participants.map((participant) => participant.snapshot());
        const scope: SnapshotTransactionScope = { callbacks: [], isAborted: false };
        try {
            const result = await this.storage.run(scope, work);
            if (scope.isAborted) {
                throw new TransactionAbortedError('current transaction is aborted');
            }
            this.commits += 1;
            for (const callback of scope.callbacks) callback();
            return result;
        } catch (error: unknown) {
            this.rollbacks += 1;
            for (const restore of restores) restore();
            throw error;
        }
    }

    async savepoint<T>(work: () => Promise<T>): Promise<T> {
        const parent = this.storage.getStore();
        if (parent === undefined) return this.run(work);
        const restores = this.participants.map((participant) => participant.snapshot());
        const scope: SnapshotTransactionScope = { callbacks: [], isAborted: false };
        try {
            const result = await this.storage.run(scope, work);
            if (scope.isAborted) {
                throw new TransactionAbortedError('current transaction is aborted');
            }
            parent.callbacks.push(...scope.callbacks);
            return result;
        } catch (error: unknown) {
            this.savepointRollbacks += 1;
            for (const restore of restores) restore();
            throw error;
        }
    }

    executor(): CommonQueryMethods {
        throw new Error('SnapshotTransactionRunner has no database connection');
    }

    afterCommit(callback: () => void): void {
        const scope = this.storage.getStore();
        if (scope === undefined) throw new Error('afterCommit was called outside a transaction');
        scope.callbacks.push(callback);
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
    /** Статус как он записан в «БД»: объекты в byId мутируются доменом до save. */
    private readonly statuses = new Map<string, RequestStatusKind>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        const savedStatuses = new Map(this.statuses);
        return () => {
            this.byId.clear();
            for (const [id, request] of saved) this.byId.set(id, request);
            this.statuses.clear();
            for (const [id, kind] of savedStatuses) this.statuses.set(id, kind);
        };
    }

    save(request: IdeaRequest, expected?: RequestStatusKind): Promise<void> {
        const stored = this.byId.get(request.id);
        if (expected === undefined) {
            if (stored === undefined) {
                this.byId.set(request.id, request);
                this.statuses.set(request.id, request.statusKind);
            }
            return Promise.resolve();
        }
        if (stored === undefined) return Promise.reject(new RequestNotFoundError(request.id));
        // Как условный UPDATE: сравниваем с «записанным» статусом, а не с живым объектом.
        const actual = this.statuses.get(request.id) ?? stored.statusKind;
        if (actual !== expected) {
            if (actual === 'under_review' && expected === 'new') {
                return Promise.reject(new RequestAlreadyTakenError(request.id));
            }
            if (actual === 'new') return Promise.reject(new RequestNotTakenError(request.id));
            return Promise.reject(new RequestAlreadyDecidedError(request.id));
        }
        this.byId.set(request.id, request);
        this.statuses.set(request.id, request.statusKind);
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

export class InMemoryBugRepository extends BugRepository implements TransactionParticipant {
    readonly byId = new Map<string, BugReport>();

    /** Если задан, `insert` падает: имитация сбоя записи. */
    insertError: Error | null = null;

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, bug] of saved) this.byId.set(id, bug);
        };
    }

    private static copy(bug: BugReport): BugReport {
        return BugReport.restore({
            id: bug.id,
            createdAt: bug.createdAt,
            authorId: bug.authorId,
            productId: bug.productId,
            agentId: bug.agentId,
            title: bug.title,
            description: bug.description,
            status: bug.status,
            wontFixReason: bug.wontFixReason,
            statusChangedBy: bug.statusChangedBy,
            statusChangedAt: bug.statusChangedAt,
        });
    }

    insert(bug: BugReport): Promise<void> {
        if (this.insertError !== null) return Promise.reject(this.insertError);
        this.byId.set(bug.id, InMemoryBugRepository.copy(bug));
        return Promise.resolve();
    }

    /** Отдаёт копию: мутация домена не попадает в «БД» до `updateStatus`. */
    findById(id: string): Promise<BugReport | null> {
        const stored = this.byId.get(id);
        return Promise.resolve(stored === undefined ? null : InMemoryBugRepository.copy(stored));
    }

    updateStatus(bug: BugReport, expected: BugStatus): Promise<boolean> {
        const stored = this.byId.get(bug.id);
        if (stored?.status !== expected) return Promise.resolve(false);
        this.byId.set(bug.id, InMemoryBugRepository.copy(bug));
        return Promise.resolve(true);
    }
}

export class InMemoryCommentRepository extends CommentRepository implements TransactionParticipant {
    readonly byId = new Map<string, RequestComment>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, comment] of saved) this.byId.set(id, comment);
        };
    }

    insert(comment: RequestComment): Promise<void> {
        this.byId.set(comment.id, comment);
        return Promise.resolve();
    }

    findById(id: string): Promise<RequestComment | null> {
        return Promise.resolve(this.byId.get(id) ?? null);
    }

    update(comment: RequestComment): Promise<void> {
        this.byId.set(comment.id, comment);
        return Promise.resolve();
    }
}

/** Лента комментариев в памяти: порядок `createdAt`, затем `id`; метка роли по автору заявки. */
export class InMemoryCommentQuery extends CommentQuery {
    /** Логины авторов; по умолчанию логин равен идентификатору. */
    readonly logins = new Map<string, string>();
    /** Части ФИО авторов; без записи полное имя равно логину. */
    readonly profiles = new Map<string, FullNameParts>();

    constructor(
        private readonly comments: InMemoryCommentRepository,
        private readonly requests: InMemoryRequestRepository,
    ) {
        super();
    }

    private toRecord(comment: RequestComment): CommentRecord {
        const login = this.logins.get(comment.authorId) ?? comment.authorId;
        const request = this.requests.byId.get(comment.requestId);
        return {
            id: comment.id,
            authorId: comment.authorId,
            body: comment.body.value,
            author: {
                id: comment.authorId,
                login,
                fullName: formatFullName(this.profiles.get(comment.authorId) ?? {}, login),
            },
            authorRole: request?.authorId === comment.authorId ? 'request_author' : 'developer',
            createdAt: comment.createdAt,
            editedAt: comment.editedAt,
        };
    }

    listByRequest(requestId: string): Promise<CommentRecord[]> {
        const items = [...this.comments.byId.values()]
            .filter((comment) => comment.requestId === requestId)
            .sort(
                (a, b) =>
                    a.createdAt.getTime() - b.createdAt.getTime() ||
                    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
            );
        return Promise.resolve(items.map((comment) => this.toRecord(comment)));
    }

    findView(id: string): Promise<CommentRecord | null> {
        const comment = this.comments.byId.get(id);
        return Promise.resolve(comment === undefined ? null : this.toRecord(comment));
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

export class InMemoryCatalogRepository extends CatalogRepository implements TransactionParticipant {
    readonly products = new Map<string, Product>();

    readonly agents = new Map<string, Agent>();

    snapshot(): () => void {
        const savedProducts = new Map(this.products);
        const savedAgents = new Map(this.agents);
        return () => {
            this.products.clear();
            for (const [key, value] of savedProducts) this.products.set(key, value);
            this.agents.clear();
            for (const [key, value] of savedAgents) this.agents.set(key, value);
        };
    }

    addProduct(slug: string, name: string): Product {
        const product: Product = { id: `product-${slug}`, slug, name };
        this.products.set(slug, product);
        return product;
    }

    addAgent(productSlug: string, slug: string, name: string): Agent {
        const product = this.products.get(productSlug);
        if (product === undefined) throw new Error(`Unknown product ${productSlug}`);
        const agent = Agent.create({
            id: `agent-${slug}`,
            slug,
            name,
            productIds: [product.id],
            now: new Date(),
        });
        this.agents.set(agent.id, agent);
        return agent;
    }

    listAgents(): Promise<AgentWithProducts[]> {
        const items: AgentWithProducts[] = [];
        for (const agent of this.agents.values()) {
            if (agent.archivedAt !== null) continue;
            const products = [...this.products.values()]
                .filter((p) => agent.productIds.includes(p.id))
                .sort((x, y) => x.slug.localeCompare(y.slug));
            if (products.length > 0) items.push({ agent, products });
        }
        return Promise.resolve(items);
    }

    findAgent(id: string): Promise<Agent | null> {
        return Promise.resolve(this.agents.get(id) ?? null);
    }

    /** Идентификаторы агентов, прочитанных с `FOR SHARE` / `FOR UPDATE`. */
    readonly sharedIds: string[] = [];

    readonly lockedIds: string[] = [];

    readonly savedAgents: Agent[] = [];

    findProductsByIds(ids: readonly string[]): Promise<Product[]> {
        return Promise.resolve(
            [...this.products.values()]
                .filter((p) => ids.includes(p.id))
                .sort((x, y) => x.slug.localeCompare(y.slug)),
        );
    }

    findAgentForShare(id: string): Promise<Agent | null> {
        this.sharedIds.push(id);
        return this.findAgent(id);
    }

    findAgentForUpdate(id: string): Promise<Agent | null> {
        this.lockedIds.push(id);
        return this.findAgent(id);
    }

    saveAgent(agent: Agent): Promise<void> {
        this.savedAgents.push(agent);
        this.agents.set(agent.id, agent);
        return Promise.resolve();
    }

    findAgentByName(key: string): Promise<Agent | null> {
        return Promise.resolve(this.agentByName(key));
    }

    findProductByName(key: string): Promise<Product | null> {
        return Promise.resolve(this.productByName(key));
    }

    nextFreeSlug(kind: CatalogKind, base: string): Promise<string> {
        const taken = new Set(
            kind === 'product'
                ? [...this.products.values()].map((p) => p.slug)
                : [...this.agents.values()].map((a) => a.slug),
        );
        let slug = base;
        for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${String(n)}`;
        return Promise.resolve(slug);
    }

    insertProduct(product: Product): Promise<void> {
        if (this.productByName(product.name.trim().toLowerCase()) !== null) {
            return Promise.reject(new ProductNameTakenError());
        }
        if (this.products.has(product.slug)) return Promise.reject(new SlugTakenError());
        this.products.set(product.slug, product);
        return Promise.resolve();
    }

    insertAgent(agent: Agent): Promise<void> {
        if (this.agentByName(agent.name.trim().toLowerCase()) !== null) {
            return Promise.reject(new AgentNameTakenError());
        }
        if ([...this.agents.values()].some((a) => a.slug === agent.slug)) {
            return Promise.reject(new SlugTakenError());
        }
        this.agents.set(agent.id, agent);
        return Promise.resolve();
    }

    private productByName(key: string): Product | null {
        return [...this.products.values()].find((p) => p.name.trim().toLowerCase() === key) ?? null;
    }

    private agentByName(key: string): Agent | null {
        return [...this.agents.values()].find((a) => a.name.trim().toLowerCase() === key) ?? null;
    }

    seed(products: readonly CatalogSeedProduct[]): Promise<CatalogSeedResult> {
        const result: CatalogSeedResult = { productsCreated: 0, agentsCreated: 0, skipped: [] };
        for (const seedProduct of products) {
            let product = this.products.get(seedProduct.slug);
            if (product === undefined) {
                const holder = this.productByName(seedProduct.name.trim().toLowerCase());
                if (holder !== null) {
                    result.skipped.push({
                        kind: 'product',
                        slug: seedProduct.slug,
                        name: seedProduct.name,
                    });
                    continue;
                }
                product = this.addProduct(seedProduct.slug, seedProduct.name);
                result.productsCreated += 1;
            }
            for (const seedAgent of seedProduct.agents) {
                const existing = [...this.agents.values()].find(
                    (agent) => agent.slug === seedAgent.slug,
                );
                if (existing === undefined) {
                    if (this.agentByName(seedAgent.name.trim().toLowerCase()) !== null) {
                        result.skipped.push({
                            kind: 'agent',
                            slug: seedAgent.slug,
                            name: seedAgent.name,
                        });
                        continue;
                    }
                    this.addAgent(seedProduct.slug, seedAgent.slug, seedAgent.name);
                    result.agentsCreated += 1;
                } else if (!existing.productIds.includes(product.id)) {
                    // Добавляем недостающую связь; имя и archivedAt не меняются.
                    this.agents.set(
                        existing.id,
                        Agent.restore({
                            id: existing.id,
                            slug: existing.slug,
                            name: existing.name,
                            productIds: [...existing.productIds, product.id],
                            archivedAt: existing.archivedAt,
                            createdAt: existing.createdAt,
                            updatedAt: existing.updatedAt,
                        }),
                    );
                }
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
    /** Части ФИО авторов; без записи полное имя равно логину. */
    readonly profiles = new Map<string, FullNameParts>();

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
            authorFullName: formatFullName(
                this.profiles.get(request.authorId) ?? {},
                this.logins.get(request.authorId) ?? request.authorId,
            ),
            title: request.title.value,
            description: request.description,
            frequency: { count: request.frequency.count, period: request.frequency.period },
            minutesPerRun: request.minutesPerRun,
            peopleCount: request.peopleCount,
            status: RequestStatusPolicy.statusOf(decision, skill?.status ?? null),
            reviewer:
                decision.kind === 'new'
                    ? null
                    : {
                          id: decision.reviewerId,
                          login: this.logins.get(decision.reviewerId) ?? decision.reviewerId,
                          fullName: formatFullName(
                              this.profiles.get(decision.reviewerId) ?? {},
                              this.logins.get(decision.reviewerId) ?? decision.reviewerId,
                          ),
                      },
            takenAt: decision.kind === 'new' ? null : decision.takenAt,
            effortHours: decision.kind === 'accepted' ? decision.effortHours : null,
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
            .filter(
                (request) =>
                    request.decision.kind === 'new' || request.decision.kind === 'under_review',
            )
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
        const products = [...this.catalog.products.values()]
            .filter((p) => agent?.productIds.includes(p.id) === true)
            .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
            .map((p) => ({ id: p.id, slug: p.slug, name: p.name }));
        if (agent === undefined || products.length === 0) return null;
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
            products,
            linkedRequestCount,
            createdAt: skill.createdAt,
            statusChangedAt: skill.statusChangedAt,
            launchedAt: skill.launchedAt,
            archivedAt: skill.archivedAt,
        };
    }

    list(filter: { status?: SkillStatus }, page: PageRequest): Promise<Page<SkillView>> {
        const views = [...this.skills.byId.values()]
            .filter((skill) => filter.status === undefined || skill.status === filter.status)
            // Условие видимости как в SlonikSkillQuery: ни навык, ни его агент не в архиве.
            .filter(
                (skill) =>
                    skill.archivedAt === null &&
                    this.catalog.agents.get(skill.agentId)?.archivedAt === null,
            )
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

/** Каталог и архив в памяти: собирает плоские строки из in-memory репозиториев. */
export class InMemoryCatalogQuery extends CatalogQuery {
    constructor(
        private readonly skills: InMemorySkillRepository,
        private readonly catalog: InMemoryCatalogRepository,
    ) {
        super();
    }

    private productsOf(agent: Agent): Product[] {
        return [...this.catalog.products.values()]
            .filter((product) => agent.productIds.includes(product.id))
            .sort((a, b) => a.slug.localeCompare(b.slug));
    }

    loadVisible(): Promise<CatalogRow[]> {
        const rows: CatalogRow[] = [];
        const products = [...this.catalog.products.values()].sort((a, b) =>
            a.slug.localeCompare(b.slug),
        );
        for (const product of products) {
            const agents = [...this.catalog.agents.values()]
                .filter(
                    (agent) => agent.archivedAt === null && agent.productIds.includes(product.id),
                )
                .sort((a, b) => a.slug.localeCompare(b.slug));
            if (agents.length === 0) rows.push({ product, agent: null, skill: null });
            for (const agent of agents) {
                const own = [...this.skills.byId.values()].filter(
                    (skill) => skill.agentId === agent.id && skill.archivedAt === null,
                );
                const ref = { id: agent.id, slug: agent.slug, name: agent.name };
                if (own.length === 0) rows.push({ product, agent: ref, skill: null });
                for (const skill of own) {
                    rows.push({
                        product,
                        agent: ref,
                        skill: {
                            id: skill.id,
                            name: skill.name.value,
                            description: skill.description,
                            status: skill.status,
                            statusChangedAt: skill.statusChangedAt,
                            launchedAt: skill.launchedAt,
                        },
                    });
                }
            }
        }
        return Promise.resolve(rows);
    }

    loadArchive(): Promise<ArchiveRows> {
        const agents = [...this.catalog.agents.values()].flatMap((agent) =>
            agent.archivedAt === null
                ? []
                : [
                      {
                          id: agent.id,
                          name: agent.name,
                          products: this.productsOf(agent),
                          skillsCount: [...this.skills.byId.values()].filter(
                              (skill) => skill.agentId === agent.id && skill.archivedAt === null,
                          ).length,
                          archivedAt: agent.archivedAt,
                      },
                  ],
        );
        const skills = [...this.skills.byId.values()].flatMap((skill) => {
            const agent = this.catalog.agents.get(skill.agentId);
            if (skill.archivedAt === null || agent === undefined) return [];
            return [
                {
                    id: skill.id,
                    name: skill.name.value,
                    agent: { id: agent.id, name: agent.name },
                    products: this.productsOf(agent),
                    status: skill.status,
                    archivedAt: skill.archivedAt,
                },
            ];
        });
        return Promise.resolve({ agents, skills });
    }
}

/** Read-модель багов в памяти: названия берёт из in-memory каталога. */
export class InMemoryBugQuery extends BugQuery {
    /** Логины пользователей; по умолчанию логин равен идентификатору. */
    readonly logins = new Map<string, string>();

    /** Записи `listByAuthor`/`listQueue` для проверки переданных параметров. */
    readonly calls: { method: string; args: unknown[] }[] = [];

    constructor(
        private readonly bugs: InMemoryBugRepository,
        private readonly catalog: InMemoryCatalogRepository,
    ) {
        super();
    }

    private person(id: string): BugPerson {
        const login = this.logins.get(id) ?? id;
        return { id, login, fullName: login };
    }

    private toRecord(bug: BugReport): BugRecord {
        const product = [...this.catalog.products.values()].find((p) => p.id === bug.productId);
        const agent = this.catalog.agents.get(bug.agentId);
        return {
            id: bug.id,
            title: bug.title.value,
            description: bug.description.value,
            product: { id: bug.productId, name: product?.name ?? bug.productId },
            agent: { id: bug.agentId, name: agent?.name ?? bug.agentId },
            status: bug.status,
            createdAt: bug.createdAt,
            statusChangedAt: bug.statusChangedAt,
            author: this.person(bug.authorId),
            statusChangedBy: bug.statusChangedBy === null ? null : this.person(bug.statusChangedBy),
            wontFixReason: bug.wontFixReason?.value ?? null,
        };
    }

    findView(id: string): Promise<BugRecord | null> {
        const bug = this.bugs.byId.get(id);
        return Promise.resolve(bug === undefined ? null : this.toRecord(bug));
    }

    listByAuthor(authorId: string, page: PageRequest): Promise<Page<BugListRecord>> {
        this.calls.push({ method: 'listByAuthor', args: [authorId, page] });
        const own = [...this.bugs.byId.values()]
            .filter((bug) => bug.authorId === authorId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return Promise.resolve(
            paginate(
                own.map((bug) => this.toRecord(bug)),
                page,
            ),
        );
    }

    listQueue(status: BugStatus | null, page: PageRequest): Promise<Page<BugListRecord>> {
        this.calls.push({ method: 'listQueue', args: [status, page] });
        const all = [...this.bugs.byId.values()];
        const matching = all.filter((bug) =>
            status === null
                ? bug.status === 'open' || bug.status === 'in_progress'
                : bug.status === status,
        );
        const closed = status === 'resolved' || status === 'wont_fix';
        matching.sort((a, b) => {
            if (closed) return b.statusChangedAt.getTime() - a.statusChangedAt.getTime();
            if (status === null && a.status !== b.status) return a.status === 'open' ? -1 : 1;
            return a.createdAt.getTime() - b.createdAt.getTime();
        });
        return Promise.resolve(
            paginate(
                matching.map((bug) => this.toRecord(bug)),
                page,
            ),
        );
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
    comments: InMemoryCommentRepository;
    commentQuery: InMemoryCommentQuery;
    bugs: InMemoryBugRepository;
    bugQuery: InMemoryBugQuery;
}

/** Полный набор двойников для тестов use case'ов портала. */
export function createPortalFixture(): PortalFixture {
    const clock = new FakeClock();
    const requests = new InMemoryRequestRepository();
    const skills = new InMemorySkillRepository();
    const catalog = new InMemoryCatalogRepository();
    const comments = new InMemoryCommentRepository();
    const bugs = new InMemoryBugRepository();
    // Раннер откатывает события, события спрашивают раннер: связываем через ссылку.
    const ref: { runner?: SnapshotTransactionRunner } = {};
    const events = new RecordingEventPublisher(() => {
        if (ref.runner === undefined) throw new Error('Fixture is not initialised');
        return ref.runner;
    });
    const transactions = new SnapshotTransactionRunner([
        requests,
        skills,
        catalog,
        comments,
        bugs,
        events,
    ]);
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
        comments,
        commentQuery: new InMemoryCommentQuery(comments, requests),
        bugs,
        bugQuery: new InMemoryBugQuery(bugs, catalog),
    };
}
