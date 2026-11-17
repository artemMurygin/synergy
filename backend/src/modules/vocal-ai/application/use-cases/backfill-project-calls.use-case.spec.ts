import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { PinoLogger } from 'nestjs-pino';
import { type CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { type SyncCursorRepositoryPort } from '../../domain/ports/sync-cursor-repository.port';
import {
    type VocalAiCallSummaryDto,
    type VocalAiGatewayPort,
} from '../../domain/ports/vocal-ai-gateway.port';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { SyncWindow } from '../../domain/value-objects/sync-window.value-object';
import { BackfillProjectCallsUseCase } from './backfill-project-calls.use-case';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PROJECT_ID = 'project-1';

interface Fixture {
    gateway: { listCalls: MockedFn<VocalAiGatewayPort['listCalls']> };
    callRepository: { upsertMany: MockedFn<CallRepositoryPort['upsertMany']> };
    cursorRepository: {
        get: MockedFn<SyncCursorRepositoryPort['get']>;
        set: MockedFn<SyncCursorRepositoryPort['set']>;
    };
    useCase: BackfillProjectCallsUseCase;
}

function createSummaryDto(callId: number): VocalAiCallSummaryDto {
    return {
        callId: new CallId(callId),
        projectId: PROJECT_ID,
        manager: 'Manager',
        client: 'Client',
        callType: 'outgoing',
        callCreatedAt: new Date('1970-01-01T00:00:00.000Z'),
        callCompletedAt: null,
        scoredAt: null,
        rescoredAt: null,
        durationSeconds: 60,
        totalScore: 80,
        maxScore: 100,
        metricScores: [],
        tags: [],
        summaries: [],
    };
}

function createFixture(): Fixture {
    const gateway = {
        listCalls: vi.fn<VocalAiGatewayPort['listCalls']>().mockResolvedValue([]),
        login: vi.fn<VocalAiGatewayPort['login']>(),
        refreshToken: vi.fn<VocalAiGatewayPort['refreshToken']>(),
        getCall: vi.fn<VocalAiGatewayPort['getCall']>(),
    };
    const callRepository = {
        upsertMany: vi.fn<CallRepositoryPort['upsertMany']>().mockResolvedValue([]),
        findByFilter: vi.fn<CallRepositoryPort['findByFilter']>(),
        countByFilter: vi.fn<CallRepositoryPort['countByFilter']>(),
        aggregateStats: vi.fn<CallRepositoryPort['aggregateStats']>(),
    };
    const cursorRepository = {
        get: vi.fn<SyncCursorRepositoryPort['get']>().mockResolvedValue(null),
        set: vi.fn<SyncCursorRepositoryPort['set']>().mockResolvedValue(undefined),
    };
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const useCase = new BackfillProjectCallsUseCase(
        gateway,
        callRepository,
        cursorRepository,
        ONE_DAY_MS,
        logger,
    );
    return { gateway, callRepository, cursorRepository, useCase };
}

describe('BackfillProjectCallsUseCase', () => {
    const now = new Date(3 * ONE_DAY_MS);

    it('pages through the full history from the epoch to now using the configured page window', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        const { gateway, useCase } = createFixture();

        await useCase.execute(PROJECT_ID);

        expect(gateway.listCalls).toHaveBeenCalledTimes(3);
        expect(gateway.listCalls).toHaveBeenNthCalledWith(
            1,
            PROJECT_ID,
            new SyncWindow({ fromAt: new Date(0), toAt: new Date(ONE_DAY_MS) }),
            'callWindow',
        );
        expect(gateway.listCalls).toHaveBeenNthCalledWith(
            2,
            PROJECT_ID,
            new SyncWindow({ fromAt: new Date(ONE_DAY_MS), toAt: new Date(2 * ONE_DAY_MS) }),
            'callWindow',
        );
        expect(gateway.listCalls).toHaveBeenNthCalledWith(
            3,
            PROJECT_ID,
            new SyncWindow({ fromAt: new Date(2 * ONE_DAY_MS), toAt: now }),
            'callWindow',
        );
        vi.useRealTimers();
    });

    it('upserts each non-empty page as it is fetched', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        const { gateway, callRepository, useCase } = createFixture();
        gateway.listCalls
            .mockResolvedValueOnce([createSummaryDto(1)])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([createSummaryDto(2)]);

        const result = await useCase.execute(PROJECT_ID);

        expect(callRepository.upsertMany).toHaveBeenCalledTimes(2);
        expect(callRepository.upsertMany.mock.calls[0][0].map((call) => call.callId.value)).toEqual(
            [1],
        );
        expect(callRepository.upsertMany.mock.calls[1][0].map((call) => call.callId.value)).toEqual(
            [2],
        );
        expect(result).toEqual({ syncedCallsCount: 2 });
        vi.useRealTimers();
    });

    it('advances the cursor to the end of each page right after it is upserted', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        const { gateway, callRepository, cursorRepository, useCase } = createFixture();
        gateway.listCalls.mockResolvedValue([createSummaryDto(1)]);

        await useCase.execute(PROJECT_ID);

        expect(cursorRepository.set).toHaveBeenCalledTimes(3);
        expect(cursorRepository.set).toHaveBeenNthCalledWith(1, PROJECT_ID, new Date(ONE_DAY_MS));
        expect(cursorRepository.set).toHaveBeenNthCalledWith(
            2,
            PROJECT_ID,
            new Date(2 * ONE_DAY_MS),
        );
        expect(cursorRepository.set).toHaveBeenNthCalledWith(3, PROJECT_ID, now);
        expect(cursorRepository.set.mock.invocationCallOrder[0]).toBeGreaterThan(
            callRepository.upsertMany.mock.invocationCallOrder[0],
        );
        vi.useRealTimers();
    });

    it('leaves the cursor at the last completed page when a later page fetch fails, so the next cycle can resume', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        const { gateway, cursorRepository, useCase } = createFixture();
        gateway.listCalls
            .mockResolvedValueOnce([createSummaryDto(1)])
            .mockRejectedValueOnce(new Error('vocal-ai down'));

        await expect(useCase.execute(PROJECT_ID)).rejects.toThrow('vocal-ai down');

        expect(cursorRepository.set).toHaveBeenCalledTimes(1);
        expect(cursorRepository.set).toHaveBeenCalledWith(PROJECT_ID, new Date(ONE_DAY_MS));
        vi.useRealTimers();
    });

    it('leaves the cursor at the last completed page when upserting a later page fails, so the next cycle can resume', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        const { gateway, callRepository, cursorRepository, useCase } = createFixture();
        gateway.listCalls.mockResolvedValue([createSummaryDto(1)]);
        callRepository.upsertMany
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('db down'));

        await expect(useCase.execute(PROJECT_ID)).rejects.toThrow('db down');

        expect(cursorRepository.set).toHaveBeenCalledTimes(1);
        expect(cursorRepository.set).toHaveBeenCalledWith(PROJECT_ID, new Date(ONE_DAY_MS));
        vi.useRealTimers();
    });

    it('stops paging and leaves the cursor at the last completed page when a page partially fails to persist, so it is retried next cycle', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        const { gateway, callRepository, cursorRepository, useCase } = createFixture();
        gateway.listCalls
            .mockResolvedValueOnce([createSummaryDto(1)])
            .mockResolvedValueOnce([createSummaryDto(2), createSummaryDto(3)]);
        callRepository.upsertMany.mockResolvedValueOnce([]).mockResolvedValueOnce([new CallId(3)]);

        const result = await useCase.execute(PROJECT_ID);

        expect(cursorRepository.set).toHaveBeenCalledTimes(1);
        expect(cursorRepository.set).toHaveBeenCalledWith(PROJECT_ID, new Date(ONE_DAY_MS));
        expect(result).toEqual({ syncedCallsCount: 2 });
        vi.useRealTimers();
    });

    it('keeps leaving the cursor unmoved on every cycle while the first page keeps failing to persist', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        const { gateway, callRepository, cursorRepository, useCase } = createFixture();
        gateway.listCalls.mockResolvedValue([createSummaryDto(1)]);
        callRepository.upsertMany.mockResolvedValue([new CallId(1)]);

        for (let cycle = 0; cycle < 10; cycle += 1) {
            const result = await useCase.execute(PROJECT_ID);
            expect(result).toEqual({ syncedCallsCount: 0 });
        }

        expect(cursorRepository.set).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
