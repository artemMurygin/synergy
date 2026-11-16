import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
    type CallFilter,
    type CallRepositoryPort,
    type CallStats,
} from '../../domain/ports/call-repository.port';
import { GetCallStatsUseCase } from './get-call-stats.use-case';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

interface Fixture {
    callRepository: { aggregateStats: MockedFn<CallRepositoryPort['aggregateStats']> };
    useCase: GetCallStatsUseCase;
}

function createFixture(stats: CallStats): Fixture {
    const callRepository = {
        aggregateStats: vi.fn<CallRepositoryPort['aggregateStats']>().mockResolvedValue(stats),
    };
    const useCase = new GetCallStatsUseCase(callRepository as unknown as CallRepositoryPort);
    return { callRepository, useCase };
}

describe('GetCallStatsUseCase', () => {
    const filter: CallFilter = { manager: 'Иванов', callDateFrom: new Date('2026-01-01') };

    it('delegates to CallRepositoryPort.aggregateStats with the same filter type as ListCallsUseCase', async () => {
        const stats: CallStats = { callCount: 5, averageScore: 72.5, problematicShare: 0.2 };
        const { callRepository, useCase } = createFixture(stats);

        const result = await useCase.execute(filter);

        expect(callRepository.aggregateStats).toHaveBeenCalledWith(filter);
        expect(result).toEqual(stats);
    });
});
