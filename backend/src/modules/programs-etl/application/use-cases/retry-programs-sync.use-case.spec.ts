import { describe, expect, it, vi } from 'vitest';
import { ProgramsSyncError } from '../errors/programs-sync.error';
import type { ProgramsSyncRunRecord, RunStatus } from '../models/programs-sync-run';
import type { SyncRunStorePort } from '../ports/programs-etl.ports';
import type { ScheduleProgramsGroupSyncService } from '../services/schedule-programs-group-sync.service';
import { RetryProgramsSyncUseCase } from './retry-programs-sync.use-case';

const CHANGED = [{ sourceId: 's1', observedHash: 'h1' }];

function run(status: RunStatus): ProgramsSyncRunRecord {
    return {
        id: 'r1',
        groupId: 'g1',
        trigger: 'scheduled',
        status,
        changedSources: CHANGED,
        createdAt: new Date('2026-11-04T10:00:00Z'),
    };
}

function setup(found: ProgramsSyncRunRecord | null): {
    useCase: RetryProgramsSyncUseCase;
    schedule: ReturnType<typeof vi.fn>;
} {
    const schedule = vi.fn(() => Promise.resolve({ runId: 'r2' }));
    const store = { findById: vi.fn(() => Promise.resolve(found)) } as unknown as SyncRunStorePort;
    const useCase = new RetryProgramsSyncUseCase(store, {
        schedule,
    } as unknown as ScheduleProgramsGroupSyncService);
    return { useCase, schedule };
}

describe('RetryProgramsSyncUseCase', () => {
    it('schedules a new retry run with the same changed sources and previousRunId', async () => {
        const { useCase, schedule } = setup(run('failed'));
        await expect(useCase.execute({ previousRunId: 'r1' })).resolves.toEqual({ runId: 'r2' });
        expect(schedule).toHaveBeenCalledWith({
            groupId: 'g1',
            changedSources: CHANGED,
            trigger: 'retry',
            previousRunId: 'r1',
        });
    });

    it.each(['queued', 'running', 'succeeded'] as const)('rejects a %s run', async (status) => {
        const { useCase, schedule } = setup(run(status));
        await expect(useCase.execute({ previousRunId: 'r1' })).rejects.toBeInstanceOf(
            ProgramsSyncError,
        );
        expect(schedule).not.toHaveBeenCalled();
    });

    it('rejects an unknown run', async () => {
        const { useCase, schedule } = setup(null);
        await expect(useCase.execute({ previousRunId: 'x' })).rejects.toMatchObject({
            code: 'RECORD_NOT_FOUND',
        });
        expect(schedule).not.toHaveBeenCalled();
    });
});
