import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { PinoLogger } from 'nestjs-pino';
import { type AuditMetricsPort } from '../../domain/ports/audit-metrics.port';
import { type AuditQueuePort } from '../../domain/ports/audit-queue.port';
import { type CrmGatewayPort } from '../../domain/ports/crm-gateway.port';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { type SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';
import { SyncDealsUseCase } from './sync-deals.use-case';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

interface Fixture {
    crmGateway: { listUpdatedDealIds: MockedFn<CrmGatewayPort['listUpdatedDealIds']> };
    auditQueue: { enqueue: MockedFn<AuditQueuePort['enqueue']> };
    cursorRepository: { set: MockedFn<SyncCursorRepositoryPort['set']> };
    metrics: { recordDealsEnqueued: Mock };
    useCase: SyncDealsUseCase;
}

function createFixture(cursor: Date | null, dealIds: DealId[] = []): Fixture {
    const crmGateway = {
        listUpdatedDealIds: vi
            .fn<CrmGatewayPort['listUpdatedDealIds']>()
            .mockResolvedValue(dealIds),
        getDeal: vi.fn<CrmGatewayPort['getDeal']>(),
    };
    const auditQueue = { enqueue: vi.fn<AuditQueuePort['enqueue']>().mockResolvedValue(undefined) };
    const cursorRepository = {
        get: vi.fn<SyncCursorRepositoryPort['get']>().mockResolvedValue(cursor),
        set: vi.fn<SyncCursorRepositoryPort['set']>().mockResolvedValue(undefined),
    };
    const metrics = { recordDealsEnqueued: vi.fn() };
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const useCase = new SyncDealsUseCase(
        crmGateway,
        auditQueue,
        cursorRepository,
        DEFAULT_WINDOW_MS,
        logger,
        metrics as unknown as AuditMetricsPort,
    );
    return { crmGateway, auditQueue, cursorRepository, metrics, useCase };
}

describe('SyncDealsUseCase', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');

    it('enqueues one audit job per updated deal', async () => {
        const dealIds = [new DealId('1'), new DealId('2'), new DealId('3')];
        const { auditQueue, metrics, useCase } = createFixture(
            new Date('2026-01-01T11:00:00.000Z'),
            dealIds,
        );

        const result = await useCase.execute(now);

        expect(result).toEqual({ enqueued: 3 });
        expect(metrics.recordDealsEnqueued).toHaveBeenCalledWith(3);
        expect(auditQueue.enqueue.mock.calls.map(([dealId]) => dealId.value)).toEqual([
            '1',
            '2',
            '3',
        ]);
    });

    it('queries the crm since the stored cursor', async () => {
        const cursor = new Date('2026-01-01T11:00:00.000Z');
        const { crmGateway, useCase } = createFixture(cursor);

        await useCase.execute(now);

        expect(crmGateway.listUpdatedDealIds).toHaveBeenCalledWith(cursor);
    });

    it('uses the default window when there is no cursor', async () => {
        const { crmGateway, useCase } = createFixture(null);

        await useCase.execute(now);

        expect(crmGateway.listUpdatedDealIds).toHaveBeenCalledWith(
            new Date(now.getTime() - DEFAULT_WINDOW_MS),
        );
    });

    it('moves the cursor to the run start time after all jobs are enqueued', async () => {
        const { auditQueue, cursorRepository, useCase } = createFixture(
            new Date('2026-01-01T11:00:00.000Z'),
            [new DealId('1')],
        );

        await useCase.execute(now);

        expect(cursorRepository.set).toHaveBeenCalledWith(now);
        expect(cursorRepository.set.mock.invocationCallOrder[0]).toBeGreaterThan(
            auditQueue.enqueue.mock.invocationCallOrder[0],
        );
    });

    it('does not move the cursor when enqueueing fails', async () => {
        const { auditQueue, cursorRepository, useCase } = createFixture(
            new Date('2026-01-01T11:00:00.000Z'),
            [new DealId('1'), new DealId('2')],
        );
        auditQueue.enqueue.mockRejectedValueOnce(new Error('queue down'));

        await expect(useCase.execute(now)).rejects.toThrow('queue down');

        expect(cursorRepository.set).not.toHaveBeenCalled();
    });

    it('does not move the cursor when the crm fails', async () => {
        const { crmGateway, cursorRepository, useCase } = createFixture(null);
        crmGateway.listUpdatedDealIds.mockRejectedValueOnce(new Error('crm down'));

        await expect(useCase.execute(now)).rejects.toThrow('crm down');

        expect(cursorRepository.set).not.toHaveBeenCalled();
    });

    it('handles an empty list without errors and still moves the cursor', async () => {
        const { auditQueue, cursorRepository, useCase } = createFixture(null, []);

        const result = await useCase.execute(now);

        expect(result).toEqual({ enqueued: 0 });
        expect(auditQueue.enqueue).not.toHaveBeenCalled();
        expect(cursorRepository.set).toHaveBeenCalledWith(now);
    });
});
