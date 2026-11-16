import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Call } from '../../domain/entities/call.entity';
import { CallMetricScore } from '../../domain/entities/call-metric-score.entity';
import { CallTag } from '../../domain/entities/call-tag.entity';
import { CallSummary } from '../../domain/entities/call-summary.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { type CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { CallNotFoundError } from '../../domain/errors';
import { GetCallDetailUseCase } from './get-call-detail.use-case';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

interface Fixture {
    callRepository: { findByFilter: MockedFn<CallRepositoryPort['findByFilter']> };
    useCase: GetCallDetailUseCase;
}

function createFixture(calls: Call[] = []): Fixture {
    const callRepository = {
        findByFilter: vi.fn<CallRepositoryPort['findByFilter']>().mockResolvedValue(calls),
    };
    const useCase = new GetCallDetailUseCase(callRepository as unknown as CallRepositoryPort);
    return { callRepository, useCase };
}

function buildCall(): Call {
    const call = Call.create({
        callId: new CallId(42),
        projectId: 'project-1',
        manager: 'Иванов',
        client: 'Клиент',
        callType: 'inbound',
        callCreatedAt: null,
        callCompletedAt: null,
        scoredAt: null,
        rescoredAt: null,
        durationSeconds: 120,
        totalScore: 80,
        maxScore: 100,
    });
    call.replaceChildren(
        [
            new CallMetricScore({
                callId: 42,
                metricId: 'm-1',
                metricTitle: 'Приветствие',
                scoreValue: 5,
                maxScore: 5,
                reason: null,
                recommendations: null,
                isException: false,
            }),
        ],
        [
            new CallTag({
                callId: 42,
                tagId: 't-1',
                tagTitle: 'Жалоба',
                value: 'да',
                valueDescription: null,
            }),
        ],
        [new CallSummary({ callId: 42, summaryTitle: 'Итог', summaryText: 'Текст саммари' })],
    );
    return call;
}

describe('GetCallDetailUseCase', () => {
    it('returns metrics, tags, summaries and score for a known call without a transcript', async () => {
        const call = buildCall();
        const { callRepository, useCase } = createFixture([call]);

        const result = await useCase.execute(new CallId(42));

        expect(callRepository.findByFilter).toHaveBeenCalledWith({ callId: new CallId(42) });
        expect(result.callId.value).toBe(42);
        expect(result.metricScores).toEqual(call.metricScores);
        expect(result.tags).toEqual(call.tags);
        expect(result.summaries).toEqual(call.summaries);
        expect(result.totalScore).toBe(80);
        expect(result.maxScore).toBe(100);
        expect(result).not.toHaveProperty('transcriptLines');
    });

    it('throws an explicit not-found error for an unknown callId', async () => {
        const { useCase } = createFixture([]);

        await expect(useCase.execute(new CallId(999))).rejects.toThrow(CallNotFoundError);
    });
});
