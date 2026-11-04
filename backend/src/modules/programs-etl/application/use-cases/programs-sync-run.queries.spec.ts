import { describe, expect, it, vi } from 'vitest';
import type { SyncRunStorePort } from '../ports/programs-etl.ports';
import { GetProgramsSyncRunQuery, ListProgramsSyncRunsQuery } from './programs-sync-run.queries';

describe('ListProgramsSyncRunsQuery', () => {
    it('delegates filters and cursor pagination to the run store', async () => {
        const page = { items: [], nextCursor: 'c2' };
        const list = vi.fn(() => Promise.resolve(page));
        const query = new ListProgramsSyncRunsQuery({ list } as unknown as SyncRunStorePort);
        const input = { groupId: 'g1', status: 'failed' as const, limit: 10, cursor: 'c1' };
        await expect(query.execute(input)).resolves.toBe(page);
        expect(list).toHaveBeenCalledWith(input);
    });
});

describe('GetProgramsSyncRunQuery', () => {
    const record = {
        id: 'r1',
        groupId: 'g1',
        trigger: 'scheduled',
        status: 'failed',
        changedSources: [],
        createdAt: new Date(),
    };

    it('returns the run details', async () => {
        const findById = vi.fn(() => Promise.resolve(record));
        const query = new GetProgramsSyncRunQuery({ findById } as unknown as SyncRunStorePort);
        await expect(query.execute({ runId: 'r1' })).resolves.toBe(record);
        expect(findById).toHaveBeenCalledWith('r1');
    });

    it('returns null when the run is not found', async () => {
        const findById = vi.fn(() => Promise.resolve(null));
        const query = new GetProgramsSyncRunQuery({ findById } as unknown as SyncRunStorePort);
        await expect(query.execute({ runId: 'nope' })).resolves.toBeNull();
    });
});
