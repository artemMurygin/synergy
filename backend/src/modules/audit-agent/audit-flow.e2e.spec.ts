import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import type { ConfigService } from '@nestjs/config';
import { Counter, Registry } from '@prometheus-io/client';
import type { Job, JobsOptions, Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../shared/config/env.schema';
import type { DealAudit } from './domain/aggregates/deal-audit.aggregate';
import { DealAuditRepositoryPort } from './domain/ports/deal-audit-repository.port';
import type { DealId } from './domain/value-objects/deal-id.value-object';
import { SyncCursorRepositoryPort } from './domain/ports/sync-cursor-repository.port';
import { DealAuditorAdapter } from './infrastructure/agent/deal-auditor.adapter';
import { MockCrmGatewayAdapter } from './infrastructure/crm/mock-crm-gateway.adapter';
import { AuditMetrics } from './infrastructure/metrics/audit-metrics';
import {
    AUDIT_DEALS_METRIC,
    DEAL_SYNC_ENQUEUED_METRIC,
    NOTIFICATIONS_METRIC,
} from './infrastructure/metrics/audit-metrics.constants';
import { AuditDealUseCase } from './application/use-cases/audit-deal.use-case';
import { SyncDealsUseCase } from './application/use-cases/sync-deals.use-case';
import { AuditQueueAdapter } from './infrastructure/queue/audit-queue.adapter';
import { DealSyncScheduler } from './infrastructure/queue/deal-sync-scheduler';
import { JOB_NAMES, QUEUE_NAMES } from './infrastructure/queue/queue.constants';
import type { AuditJobData } from './infrastructure/queue/queue-job-data';
import { AuditProcessor } from './interface/queue/audit.processor';
import { DealSyncProcessor } from './interface/queue/deal-sync.processor';

const NOW = new Date('2026-01-20T00:00:00Z');
const LATER = new Date('2026-01-21T00:00:00Z');
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const INTERVAL_MINUTES = 15;
const ATTEMPTS = 3;
const BACKOFF_MS = 4000;
const DEAL_JSON_PATTERN = /<deal>(.*)<\/deal>/;

interface FakeJob {
    id: string;
    name: string;
    data: unknown;
    opts: JobsOptions;
    attemptsMade: number;
}

interface SchedulerRecord {
    id: string;
    every: number | undefined;
    name: string | undefined;
    opts: JobsOptions | undefined;
}

function asJob<TData>(job: FakeJob): Job<TData> {
    return job as unknown as Job<TData>;
}

class FakeQueue {
    readonly jobs: FakeJob[] = [];
    readonly addedIds: string[] = [];
    readonly schedulers: SchedulerRecord[] = [];
    private readonly knownIds = new Set<string>();
    private sequence = 0;

    add(name: string, data: unknown, opts: JobsOptions = {}): Promise<void> {
        if (opts.jobId !== undefined) {
            if (this.knownIds.has(opts.jobId)) {
                return Promise.resolve();
            }
            this.knownIds.add(opts.jobId);
        }
        this.sequence += 1;
        this.addedIds.push(opts.jobId ?? String(this.sequence));
        this.jobs.push({
            id: opts.jobId ?? String(this.sequence),
            name,
            data,
            opts: { attempts: ATTEMPTS, ...opts },
            attemptsMade: 0,
        });
        return Promise.resolve();
    }

    upsertJobScheduler(
        id: string,
        repeat: { every?: number },
        template?: { name?: string; opts?: JobsOptions },
    ): Promise<void> {
        this.schedulers.push({
            id,
            every: repeat.every,
            name: template?.name,
            opts: template?.opts,
        });
        return Promise.resolve();
    }

    fireScheduler(): Promise<void> {
        const scheduler = this.schedulers.at(-1);
        if (scheduler?.name === undefined) {
            throw new Error('Scheduler is not registered');
        }
        return this.add(scheduler.name, {}, scheduler.opts);
    }
}

class InMemoryAuditRepository extends DealAuditRepositoryPort {
    readonly saved: DealAudit[] = [];

    findByVersion(dealId: DealId, dealUpdatedAt: Date): Promise<DealAudit | null> {
        const found = this.saved.find(
            (audit) =>
                audit.dealId.value === dealId.value &&
                audit.dealUpdatedAt.getTime() === dealUpdatedAt.getTime(),
        );
        return Promise.resolve(found ?? null);
    }

    save(audit: DealAudit): Promise<void> {
        this.saved.push(audit);
        return Promise.resolve();
    }
}

class InMemoryCursorRepository extends SyncCursorRepositoryPort {
    value: Date | null = null;

    get(): Promise<Date | null> {
        return Promise.resolve(this.value);
    }

    set(value: Date): Promise<void> {
        this.value = value;
        return Promise.resolve();
    }
}

class RuleBasedChatModel extends BaseChatModel {
    private responseToolName: string | null = null;

    constructor() {
        super({});
    }

    _llmType(): string {
        return 'rule-based';
    }

    bindTools(tools: unknown[]): this {
        for (const boundTool of tools) {
            const name = this.readFunctionName(boundTool);
            if (name !== null && /^extract-\d+$/.test(name)) {
                this.responseToolName = name;
            }
        }
        return this;
    }

    _generate(messages: BaseMessage[]): Promise<ChatResult> {
        const deal = this.readDeal(messages);
        const missing = Object.entries(deal)
            .filter(([key, value]) => value === null && key !== 'responsibleId')
            .map(([key]) => key);
        const call = this.decide(missing);
        const message = new AIMessage({
            content: '',
            tool_calls: [{ id: 'call-0', ...call }],
        });
        return Promise.resolve({ generations: [{ text: '', message }] });
    }

    private decide(missing: string[]): { name: string; args: Record<string, unknown> } {
        return {
            name: this.resolveResponseToolName(),
            args: {
                verdict: missing.length === 0 ? 'ok' : 'violations',
                issues: missing.map((field) => ({ field, reason: `${field} is empty` })),
            },
        };
    }

    private readDeal(messages: BaseMessage[]): Record<string, unknown> {
        const text = messages.map((message) => message.text).find((t) => DEAL_JSON_PATTERN.test(t));
        const json = text === undefined ? undefined : DEAL_JSON_PATTERN.exec(text)?.[1];
        if (json === undefined) {
            throw new Error('Deal is missing in the prompt');
        }
        return JSON.parse(json) as Record<string, unknown>;
    }

    private readFunctionName(value: unknown): string | null {
        if (typeof value !== 'object' || value === null || !('function' in value)) {
            return null;
        }
        const definition = value.function;
        if (typeof definition !== 'object' || definition === null || !('name' in definition)) {
            return null;
        }
        return typeof definition.name === 'string' ? definition.name : null;
    }

    private resolveResponseToolName(): string {
        if (this.responseToolName === null) {
            throw new Error('Response tool is not bound');
        }
        return this.responseToolName;
    }
}

interface Harness {
    queues: Record<'dealSync' | 'audit', FakeQueue>;
    auditRepository: InMemoryAuditRepository;
    cursorRepository: InMemoryCursorRepository;
    registry: Registry;
    scheduler: DealSyncScheduler;
    auditProcessor: AuditProcessor;
    drain: () => Promise<void>;
}

function createLogger(): PinoLogger {
    return {
        setContext: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    } as unknown as PinoLogger;
}

function createConfig(): ConfigService<Env, true> {
    const values: Record<string, number> = {
        DEAL_SYNC_INTERVAL_MINUTES: INTERVAL_MINUTES,
        DEAL_SYNC_ATTEMPTS: ATTEMPTS,
        DEAL_SYNC_BACKOFF_MS: BACKOFF_MS,
    };
    return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

function createHarness(): Harness {
    const queues = {
        dealSync: new FakeQueue(),
        audit: new FakeQueue(),
    };
    const asQueue = (queue: FakeQueue): Queue => queue as unknown as Queue;
    const registry = new Registry();
    const counter = (name: string, labelNames: string[] = []): Counter =>
        new Counter({ name, help: name, labelNames, registers: [registry] });

    const crmGateway = new MockCrmGatewayAdapter();
    const auditRepository = new InMemoryAuditRepository();
    const cursorRepository = new InMemoryCursorRepository();
    const auditQueue = new AuditQueueAdapter(asQueue(queues.audit));
    const auditor = new DealAuditorAdapter(new RuleBasedChatModel());

    const metrics = new AuditMetrics(
        counter(AUDIT_DEALS_METRIC, ['verdict']),
        counter(NOTIFICATIONS_METRIC, ['status']),
        counter(DEAL_SYNC_ENQUEUED_METRIC),
    );
    const syncDeals = new SyncDealsUseCase(
        crmGateway,
        auditQueue,
        cursorRepository,
        30 * DAY_MS,
        createLogger(),
        metrics,
    );
    const auditDeal = new AuditDealUseCase(
        crmGateway,
        auditRepository,
        auditor,
        createLogger(),
        metrics,
    );

    const dealSyncProcessor = new DealSyncProcessor(syncDeals, createLogger());
    const auditProcessor = new AuditProcessor(auditDeal, createLogger());

    const run = async (
        queue: FakeQueue,
        handler: (job: FakeJob) => Promise<unknown>,
    ): Promise<void> => {
        while (queue.jobs.length > 0) {
            const job = queue.jobs.shift();
            if (job === undefined) {
                break;
            }
            try {
                await handler(job);
            } catch (err: unknown) {
                job.attemptsMade += 1;
                const isPermanent = err instanceof Error && err.name === 'UnrecoverableError';
                if (!isPermanent && job.attemptsMade < (job.opts.attempts ?? 1)) {
                    queue.jobs.push(job);
                }
            }
        }
    };

    const drain = async (): Promise<void> => {
        do {
            await run(queues.dealSync, () => dealSyncProcessor.process());
            await run(queues.audit, (job) => auditProcessor.process(asJob<AuditJobData>(job)));
        } while (queues.dealSync.jobs.length + queues.audit.jobs.length > 0);
    };

    const scheduler = new DealSyncScheduler(asQueue(queues.dealSync), createConfig());

    return {
        queues,
        auditRepository,
        cursorRepository,
        registry,
        scheduler,
        auditProcessor,
        drain,
    };
}

async function metricValue(
    registry: Registry,
    name: string,
    labels: Record<string, string> = {},
): Promise<number> {
    const metric = await registry.getSingleMetric(name)?.get();
    const entry = metric?.values.find((v) =>
        Object.entries(labels).every(([key, value]) => v.labels[key] === value),
    );
    return entry?.value ?? 0;
}

describe('audit flow on mocks', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('registers the deal-sync scheduler with interval, attempts and backoff', async () => {
        const harness = createHarness();

        await harness.scheduler.register();

        expect(harness.queues.dealSync.schedulers).toEqual([
            {
                id: 'deal-sync',
                every: INTERVAL_MINUTES * MINUTE_MS,
                name: JOB_NAMES.SYNC_DEALS,
                opts: {
                    attempts: ATTEMPTS,
                    backoff: { type: 'exponential', delay: BACKOFF_MS },
                },
            },
        ]);
    });

    it('audits every updated deal', async () => {
        const harness = createHarness();
        await harness.scheduler.register();

        await harness.queues.dealSync.fireScheduler();
        await harness.drain();

        const verdictByDeal = new Map(
            harness.auditRepository.saved.map((audit) => [audit.dealId.value, audit.verdict]),
        );
        expect(verdictByDeal.size).toBe(10);
        expect(
            [...verdictByDeal.entries()].filter(([, v]) => v === 'ok').map(([id]) => id),
        ).toEqual(['1001', '1002', '1010']);
        expect([...verdictByDeal.entries()].filter(([, v]) => v === 'violations').length).toBe(7);
        const issuesOf1009 = harness.auditRepository.saved.find(
            (audit) => audit.dealId.value === '1009',
        );
        expect(issuesOf1009?.issues.map((issue) => issue.field)).toEqual([
            'clientName',
            'phone',
            'studyForm',
        ]);

        expect(await metricValue(harness.registry, DEAL_SYNC_ENQUEUED_METRIC)).toBe(10);
        expect(await metricValue(harness.registry, AUDIT_DEALS_METRIC, { verdict: 'ok' })).toBe(3);
        expect(
            await metricValue(harness.registry, AUDIT_DEALS_METRIC, { verdict: 'violations' }),
        ).toBe(7);
    });

    it('does not duplicate audits on the next scheduler run', async () => {
        const harness = createHarness();
        await harness.scheduler.register();
        await harness.queues.dealSync.fireScheduler();
        await harness.drain();
        const auditsAfterFirstRun = harness.auditRepository.saved.length;

        vi.setSystemTime(LATER);
        await harness.queues.dealSync.fireScheduler();
        await harness.drain();

        expect(harness.auditRepository.saved).toHaveLength(auditsAfterFirstRun);
        expect(harness.cursorRepository.value).toEqual(LATER);
    });

    it('drops duplicate audit jobs by jobId and skips already audited versions', async () => {
        const harness = createHarness();
        await harness.scheduler.register();
        await harness.queues.dealSync.fireScheduler();
        await harness.drain();

        harness.cursorRepository.value = null;
        await harness.queues.dealSync.fireScheduler();
        await harness.drain();

        expect(new Set(harness.queues.audit.addedIds).size).toBe(
            harness.queues.audit.addedIds.length,
        );
        expect(harness.queues.audit.addedIds).toContain('audit-1003');

        const result = await harness.auditProcessor.process(
            asJob<AuditJobData>({
                id: 'manual',
                name: JOB_NAMES.AUDIT_DEAL,
                data: { dealId: '1003' },
                opts: {},
                attemptsMade: 0,
            }),
        );
        expect(result).toEqual({ status: 'already-audited' });
        expect(harness.auditRepository.saved).toHaveLength(10);
    });

    it('keeps the queue contract of architecture.md', async () => {
        const harness = createHarness();
        await harness.scheduler.register();
        await harness.queues.dealSync.fireScheduler();
        const syncJob = harness.queues.dealSync.jobs[0];
        expect(syncJob.name).toBe('sync-deals');
        expect(syncJob.data).toEqual({});
        expect(QUEUE_NAMES).toEqual({
            DEAL_SYNC: 'deal-sync',
            AUDIT: 'audit',
            NOTIFICATION: 'notification',
        });

        await harness.drain();

        expect(harness.queues.audit.addedIds[0]).toMatch(/^audit-\d+$/);
    });
});
