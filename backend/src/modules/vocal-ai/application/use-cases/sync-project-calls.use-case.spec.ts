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
import { type BackfillProjectCallsUseCase } from './backfill-project-calls.use-case';
import { SyncProjectCallsUseCase } from './sync-project-calls.use-case';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

const PROJECT_ID = 'project-1';

interface Fixture {
    gateway: { listCalls: MockedFn<VocalAiGatewayPort['listCalls']> };
    callRepository: { upsertMany: MockedFn<CallRepositoryPort['upsertMany']> };
    cursorRepository: {
        get: MockedFn<SyncCursorRepositoryPort['get']>;
        set: MockedFn<SyncCursorRepositoryPort['set']>;
    };
    backfillUseCase: { execute: Mock<BackfillProjectCallsUseCase['execute']> };
    useCase: SyncProjectCallsUseCase;
}

function createSummaryDto(callId: number): VocalAiCallSummaryDto {
    return {
        callId: new CallId(callId),
        projectId: PROJECT_ID,
        manager: 'Manager',
        client: 'Client',
        callType: 'outgoing',
        callCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
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

function createFixture(cursor: Date | null): Fixture {
    const gateway = {
        listCalls: vi.fn<VocalAiGatewayPort['listCalls']>().mockResolvedValue([]),
        login: vi.fn<VocalAiGatewayPort['login']>(),
        refreshToken: vi.fn<VocalAiGatewayPort['refreshToken']>(),
        getCall: vi.fn<VocalAiGatewayPort['getCall']>(),
    };
    const callRepository = {
        upsertMany: vi.fn<CallRepositoryPort['upsertMany']>().mockResolvedValue(undefined),
        findByFilter: vi.fn<CallRepositoryPort['findByFilter']>(),
        aggregateStats: vi.fn<CallRepositoryPort['aggregateStats']>(),
    };
    const cursorRepository = {
        get: vi.fn<SyncCursorRepositoryPort['get']>().mockResolvedValue(cursor),
        set: vi.fn<SyncCursorRepositoryPort['set']>().mockResolvedValue(undefined),
    };
    const backfillUseCase = {
        execute: vi.fn<BackfillProjectCallsUseCase['execute']>().mockResolvedValue({
            syncedCallsCount: 0,
        }),
    };
    const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
    const useCase = new SyncProjectCallsUseCase(
        gateway,
        callRepository,
        cursorRepository,
        backfillUseCase,
        logger,
    );
    return { gateway, callRepository, cursorRepository, backfillUseCase, useCase };
}

describe('SyncProjectCallsUseCase', () => {
    const lastSyncedAt = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-01-01T01:00:00.000Z');

    it('delegates to the backfill use case when there is no cursor for the project', async () => {
        const { backfillUseCase, gateway, cursorRepository, useCase } = createFixture(null);
        backfillUseCase.execute.mockResolvedValue({ syncedCallsCount: 42 });

        const result = await useCase.execute(PROJECT_ID, now);

        expect(backfillUseCase.execute).toHaveBeenCalledWith(PROJECT_ID);
        expect(gateway.listCalls).not.toHaveBeenCalled();
        expect(cursorRepository.set).not.toHaveBeenCalled();
        expect(result).toEqual({ syncedCallsCount: 42 });
    });

    it('queries the call window and the score window separately for the same [lastSyncedAt, now) range', async () => {
        const { gateway, useCase } = createFixture(lastSyncedAt);
        const window = new SyncWindow({ fromAt: lastSyncedAt, toAt: now });

        await useCase.execute(PROJECT_ID, now);

        expect(gateway.listCalls).toHaveBeenCalledTimes(2);
        expect(gateway.listCalls).toHaveBeenNthCalledWith(1, PROJECT_ID, window, 'callWindow');
        expect(gateway.listCalls).toHaveBeenNthCalledWith(2, PROJECT_ID, window, 'scoreWindow');
    });

    it('deduplicates calls returned by both windows by callId before upserting', async () => {
        const { gateway, callRepository, useCase } = createFixture(lastSyncedAt);
        gateway.listCalls
            .mockResolvedValueOnce([createSummaryDto(1), createSummaryDto(2)])
            .mockResolvedValueOnce([createSummaryDto(2), createSummaryDto(3)]);

        const result = await useCase.execute(PROJECT_ID, now);

        expect(callRepository.upsertMany).toHaveBeenCalledTimes(1);
        const upsertedCallIds = callRepository.upsertMany.mock.calls[0][0]
            .map((call) => call.callId.value)
            .sort((a, b) => a - b);
        expect(upsertedCallIds).toEqual([1, 2, 3]);
        expect(result).toEqual({ syncedCallsCount: 3 });
    });

    it('moves the cursor to now only after the upsert succeeds', async () => {
        const { callRepository, cursorRepository, useCase } = createFixture(lastSyncedAt);

        await useCase.execute(PROJECT_ID, now);

        expect(cursorRepository.set).toHaveBeenCalledWith(PROJECT_ID, now);
        expect(cursorRepository.set.mock.invocationCallOrder[0]).toBeGreaterThan(
            callRepository.upsertMany.mock.invocationCallOrder[0],
        );
    });

    it('does not move the cursor when listCalls fails', async () => {
        const { gateway, cursorRepository, useCase } = createFixture(lastSyncedAt);
        gateway.listCalls.mockRejectedValueOnce(new Error('vocal-ai down'));

        await expect(useCase.execute(PROJECT_ID, now)).rejects.toThrow('vocal-ai down');

        expect(cursorRepository.set).not.toHaveBeenCalled();
    });

    it('does not move the cursor when upsertMany fails', async () => {
        const { callRepository, cursorRepository, useCase } = createFixture(lastSyncedAt);
        callRepository.upsertMany.mockRejectedValueOnce(new Error('db down'));

        await expect(useCase.execute(PROJECT_ID, now)).rejects.toThrow('db down');

        expect(cursorRepository.set).not.toHaveBeenCalled();
    });
});
