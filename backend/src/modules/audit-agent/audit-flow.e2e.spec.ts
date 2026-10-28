import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import type { ConfigService } from '@nestjs/config';
import { Counter, Registry } from '@prometheus-io/client';
import type { Job, JobsOptions, Queue } from 'bullmq';
import type { PinoLogger } from 'nestjs-pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../shared/config/env.schema';
import { AuditToolsFactory, EMPLOYEE_NOT_FOUND_MESSAGE } from './application/audit-tools.factory';
import type { AuditTools } from './domain/audit-tools';
import type { DealAudit } from './domain/aggregates/deal-audit.aggregate';
import { DealAuditRepositoryPort } from './domain/ports/deal-audit-repository.port';
import type { DealId } from './domain/value-objects/deal-id.value-object';
import { EmployeeRepositoryPort } from './domain/ports/employee-repository.port';
import { Employee } from './domain/aggregates/employee.aggregate';
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
import { DeliverNotificationUseCase } from './application/use-cases/deliver-notification.use-case';
import { SyncDealsUseCase } from './application/use-cases/sync-deals.use-case';
import { AuditQueueAdapter } from './infrastructure/queue/audit-queue.adapter';
import { DealSyncScheduler } from './infrastructure/queue/deal-sync-scheduler';
import { NotificationQueueAdapter } from './infrastructure/queue/notification-queue.adapter';
import { JOB_NAMES, QUEUE_NAMES } from './infrastructure/queue/queue.constants';
import { NotifierAdapter } from './infrastructure/telegram/notifier.adapter';
import type { AuditJobData, NotificationJobData } from './infrastructure/queue/queue-job-data';
import { AuditProcessor } from './interface/queue/audit.processor';
import { DealSyncProcessor } from './interface/queue/deal-sync.processor';
import { NotificationProcessor } from './interface/queue/notification.processor';

const NOW = new Date('2026-01-20T00:00:00Z');
const LATER = new Date('2026-01-21T00:00:00Z');
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const INTERVAL_MINUTES = 15;
const ATTEMPTS = 3;
const BACKOFF_MS = 4000;
const TELEGRAM_URL_PATTERN = /^https:\/\/api\.telegram\.org\/bot.+\/sendMessage$/;
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

class InMemoryEmployeeRepository extends EmployeeRepositoryPort {
    private readonly employees = [
        Employee.create({
            id: 'e-1',
            crmResponsibleId: '101',
            fullName: 'Ivan Petrov',
            telegramUsername: 'ivan_petrov',
            telegramChatId: '1001',
            isActive: true,
        }),
        Employee.create({
            id: 'e-2',
            crmResponsibleId: '102',
            fullName: 'Maria Sidorova',
            telegramUsername: 'maria_sidorova',
            telegramChatId: '1002',
            isActive: true,
        }),
        Employee.create({
            id: 'e-3',
            crmResponsibleId: '103',
            fullName: 'Alexey Smirnov',
            telegramUsername: 'alexey_smirnov',
            telegramChatId: '1003',
            isActive: true,
        }),
        Employee.create({
            id: 'e-4',
            crmResponsibleId: '104',
            fullName: 'Olga Kuznetsova',
            telegramUsername: 'olga_kuznetsova',
            telegramChatId: '1004',
            isActive: false,
        }),
    ];

    findByUsername(username: string): Promise<Employee | null> {
        const found = this.employees.find((e) => e.isActive && e.telegramUsername === username);
        return Promise.resolve(found ?? null);
    }

    findByResponsibleId(id: string): Promise<Employee | null> {
        const found = this.employees.find((e) => e.isActive && e.crmResponsibleId === id);
        return Promise.resolve(found ?? null);
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
        const toolMessages = messages.filter((message) => message.type === 'tool');
        const call = this.decide(deal, missing, toolMessages);
        const message = new AIMessage({
            content: '',
            tool_calls: [{ id: `call-${String(toolMessages.length)}`, ...call }],
        });
        return Promise.resolve({ generations: [{ text: '', message }] });
    }

    private decide(
        deal: Record<string, unknown>,
        missing: string[],
        toolMessages: BaseMessage[],
    ): { name: string; args: Record<string, unknown> } {
        const verdict = missing.length === 0 ? 'ok' : 'violations';
        const result = {
            name: this.resolveResponseToolName(),
            args: {
                verdict,
                issues: missing.map((field) => ({ field, reason: `${field} is empty` })),
            },
        };
        if (missing.length === 0) {
            return result;
        }
        if (toolMessages.length === 0) {
            return { name: 'get_user_telegram_account_by_id', args: { id: deal.responsibleId } };
        }
        const username = toolMessages[0].text;
        if (toolMessages.length === 1 && username !== EMPLOYEE_NOT_FOUND_MESSAGE) {
            return {
                name: 'notify_responsible',
                args: {
                    username,
                    message: `Deal ${String(deal.id)}: fill ${missing.join(', ')}`,
                },
            };
        }
        return result;
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

interface TelegramCall {
    url: string;
    chatId: string;
    text: string;
}

interface Harness {
    queues: Record<'dealSync' | 'audit' | 'notification', FakeQueue>;
    auditRepository: InMemoryAuditRepository;
    cursorRepository: InMemoryCursorRepository;
    telegramCalls: TelegramCall[];
    registry: Registry;
    scheduler: DealSyncScheduler;
    auditProcessor: AuditProcessor;
    failTelegramTimes: { value: number };
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
        notification: new FakeQueue(),
    };
    const asQueue = (queue: FakeQueue): Queue => queue as unknown as Queue;
    const registry = new Registry();
    const counter = (name: string, labelNames: string[] = []): Counter =>
        new Counter({ name, help: name, labelNames, registers: [registry] });

    const crmGateway = new MockCrmGatewayAdapter();
    const employees = new InMemoryEmployeeRepository();
    const auditRepository = new InMemoryAuditRepository();
    const cursorRepository = new InMemoryCursorRepository();
    const failTelegramTimes = { value: 0 };
    const telegramCalls: TelegramCall[] = [];
    const fetchFn = vi.fn<typeof fetch>((input, init) => {
        if (failTelegramTimes.value > 0) {
            failTelegramTimes.value -= 1;
            return Promise.resolve(new Response('{"description":"bad gateway"}', { status: 502 }));
        }
        const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
            chat_id: string;
            text: string;
        };
        telegramCalls.push({
            url: input instanceof Request ? input.url : input.toString(),
            chatId: body.chat_id,
            text: body.text,
        });
        return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
    });

    const auditQueue = new AuditQueueAdapter(asQueue(queues.audit));
    const notificationQueue = new NotificationQueueAdapter(asQueue(queues.notification));
    const auditor = new DealAuditorAdapter(new RuleBasedChatModel());
    const notifier = new NotifierAdapter({ botToken: 'token', timeoutMs: 1000 }, fetchFn);
    const toolsFactory = new AuditToolsFactory(employees, notificationQueue);

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
        toolsFactory,
        createLogger(),
        metrics,
    );
    const deliverNotification = new DeliverNotificationUseCase(
        employees,
        notifier,
        createLogger(),
        metrics,
    );

    const dealSyncProcessor = new DealSyncProcessor(syncDeals, createLogger());
    const auditProcessor = new AuditProcessor(auditDeal, createLogger());
    const notificationProcessor = new NotificationProcessor(deliverNotification, createLogger());

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
            await run(queues.notification, (job) =>
                notificationProcessor.process(asJob<NotificationJobData>(job)),
            );
        } while (
            queues.dealSync.jobs.length +
                queues.audit.jobs.length +
                queues.notification.jobs.length >
            0
        );
    };

    const scheduler = new DealSyncScheduler(asQueue(queues.dealSync), createConfig());

    return {
        queues,
        auditRepository,
        cursorRepository,
        telegramCalls,
        registry,
        scheduler,
        auditProcessor,
        failTelegramTimes,
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

    it('audits every updated deal and notifies only responsible employees of incomplete deals', async () => {
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

        expect(harness.telegramCalls.map((call) => call.chatId).sort()).toEqual([
            '1001',
            '1001',
            '1002',
            '1003',
            '1003',
        ]);
        for (const call of harness.telegramCalls) {
            expect(call.url).toMatch(TELEGRAM_URL_PATTERN);
        }
        const notifiedDeals = harness.telegramCalls.map((call) => call.text.split(':')[0]).sort();
        expect(notifiedDeals).toEqual([
            'Deal 1003',
            'Deal 1004',
            'Deal 1005',
            'Deal 1006',
            'Deal 1007',
        ]);

        expect(await metricValue(harness.registry, DEAL_SYNC_ENQUEUED_METRIC)).toBe(10);
        expect(await metricValue(harness.registry, AUDIT_DEALS_METRIC, { verdict: 'ok' })).toBe(3);
        expect(
            await metricValue(harness.registry, AUDIT_DEALS_METRIC, { verdict: 'violations' }),
        ).toBe(7);
        expect(await metricValue(harness.registry, NOTIFICATIONS_METRIC, { status: 'sent' })).toBe(
            5,
        );
    });

    it('does not duplicate audits or messages on the next scheduler run', async () => {
        const harness = createHarness();
        await harness.scheduler.register();
        await harness.queues.dealSync.fireScheduler();
        await harness.drain();
        const auditsAfterFirstRun = harness.auditRepository.saved.length;
        const messagesAfterFirstRun = harness.telegramCalls.length;

        vi.setSystemTime(LATER);
        await harness.queues.dealSync.fireScheduler();
        await harness.drain();

        expect(harness.auditRepository.saved).toHaveLength(auditsAfterFirstRun);
        expect(harness.telegramCalls).toHaveLength(messagesAfterFirstRun);
        expect(harness.cursorRepository.value).toEqual(LATER);
    });

    it('drops duplicate audit jobs by jobId and skips already audited versions', async () => {
        const harness = createHarness();
        await harness.scheduler.register();
        await harness.queues.dealSync.fireScheduler();
        await harness.drain();
        const messagesAfterFirstRun = harness.telegramCalls.length;

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
        expect(harness.telegramCalls).toHaveLength(messagesAfterFirstRun);
    });

    it('retries a transient Telegram failure and delivers the message once', async () => {
        const harness = createHarness();
        harness.failTelegramTimes.value = 1;
        await harness.scheduler.register();

        await harness.queues.dealSync.fireScheduler();
        await harness.drain();

        expect(harness.telegramCalls).toHaveLength(5);
        expect(
            await metricValue(harness.registry, NOTIFICATIONS_METRIC, { status: 'failed' }),
        ).toBe(1);
        expect(await metricValue(harness.registry, NOTIFICATIONS_METRIC, { status: 'sent' })).toBe(
            5,
        );
    });

    it('builds tools that match the AuditTools contract', () => {
        const tools: AuditTools = new AuditToolsFactory(
            new InMemoryEmployeeRepository(),
            new NotificationQueueAdapter({ add: vi.fn() } as unknown as Queue),
        ).create({ dealId: '1', dealUpdatedAt: new Date('2026-01-01T00:00:00Z') });

        expect(Object.keys(tools).sort()).toEqual([
            'getUserTelegramAccountById',
            'notifyResponsible',
        ]);
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
