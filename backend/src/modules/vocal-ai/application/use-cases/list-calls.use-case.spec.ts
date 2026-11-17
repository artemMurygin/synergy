import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Call } from '../../domain/entities/call.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { type CallFilter, type CallRepositoryPort } from '../../domain/ports/call-repository.port';
import { ListCallsUseCase } from './list-calls.use-case';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

interface Fixture {
    callRepository: {
        findByFilter: MockedFn<CallRepositoryPort['findByFilter']>;
        countByFilter: MockedFn<CallRepositoryPort['countByFilter']>;
    };
    useCase: ListCallsUseCase;
}

function createFixture(calls: Call[] = []): Fixture {
    const callRepository = {
        findByFilter: vi.fn<CallRepositoryPort['findByFilter']>().mockResolvedValue(calls),
        countByFilter: vi.fn<CallRepositoryPort['countByFilter']>().mockResolvedValue(calls.length),
    };
    const useCase = new ListCallsUseCase(callRepository as unknown as CallRepositoryPort);
    return { callRepository, useCase };
}

describe('ListCallsUseCase', () => {
    const filter: CallFilter = { projectId: 'project-1', manager: 'Иванов' };

    it('delegates to CallRepositoryPort.findByFilter and returns its result', async () => {
        const call = Call.create({
            callId: new CallId(1),
            projectId: 'project-1',
            manager: 'Иванов',
            client: null,
            callType: null,
            callCreatedAt: null,
            callCompletedAt: null,
            scoredAt: null,
            rescoredAt: null,
            durationSeconds: null,
            totalScore: null,
            maxScore: null,
        });
        const { callRepository, useCase } = createFixture([call]);

        const result = await useCase.execute(filter);

        expect(callRepository.findByFilter).toHaveBeenCalledWith(filter);
        expect(callRepository.countByFilter).toHaveBeenCalledWith(filter);
        expect(result).toEqual({ calls: [call], totalCount: 1, truncated: false });
    });

    it('returns an empty list without error when nothing matches', async () => {
        const { useCase } = createFixture([]);

        const result = await useCase.execute(filter);

        expect(result).toEqual({ calls: [], totalCount: 0, truncated: false });
    });

    it('reports truncated when fewer calls are returned than the total count', async () => {
        const call = Call.create({
            callId: new CallId(1),
            projectId: 'project-1',
            manager: 'Иванов',
            client: null,
            callType: null,
            callCreatedAt: null,
            callCompletedAt: null,
            scoredAt: null,
            rescoredAt: null,
            durationSeconds: null,
            totalScore: null,
            maxScore: null,
        });
        const { callRepository, useCase } = createFixture([call]);
        callRepository.countByFilter.mockResolvedValue(5);

        const result = await useCase.execute({ ...filter, limit: 1 });

        expect(result).toEqual({ calls: [call], totalCount: 5, truncated: true });
    });

    it('reports not truncated once the requested offset has reached the last page', async () => {
        const { callRepository, useCase } = createFixture([]);
        callRepository.countByFilter.mockResolvedValue(5);

        const result = await useCase.execute({ ...filter, limit: 5, offset: 5 });

        expect(result).toEqual({ calls: [], totalCount: 5, truncated: false });
    });
});
