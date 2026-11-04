import { describe, expect, it, vi } from 'vitest';
import { ProgramsSyncError } from '../errors/programs-sync.error';
import { createProgramsGroup } from '../models/programs-group';
import type { ProgramsSyncRunRecord } from '../models/programs-sync-run';
import type {
    GroupRegistryPort,
    ProgramsSyncQueuePort,
    SyncRunStorePort,
} from '../ports/programs-etl.ports';
import { ScheduleProgramsGroupSyncService } from './schedule-programs-group-sync.service';

const NOW = new Date('2026-11-04T10:00:00Z');
const CHANGED = [{ sourceId: 's1', observedHash: 'h1' }];

interface Setup {
    service: ScheduleProgramsGroupSyncService;
    createQueued: ReturnType<typeof vi.fn>;
    markFailed: ReturnType<typeof vi.fn>;
    enqueueGroup: ReturnType<typeof vi.fn>;
    calls: string[];
}

function setup(status = 'ready', enqueueError?: Error): Setup {
    const calls: string[] = [];
    const createQueued = vi.fn((run: Parameters<SyncRunStorePort['createQueued']>[0]) => {
        calls.push('createQueued');
        return Promise.resolve({
            id: run.id,
            groupId: run.groupId,
            trigger: run.trigger,
            status: 'queued',
            changedSources: run.changedSources,
            createdAt: run.now,
        } as ProgramsSyncRunRecord);
    });
    const markFailed = vi.fn(() => Promise.resolve());
    const enqueueGroup = vi.fn(() => {
        calls.push('enqueueGroup');
        return enqueueError ? Promise.reject(enqueueError) : Promise.resolve();
    });
    const store = { createQueued, markFailed } as unknown as SyncRunStorePort;
    const queue: ProgramsSyncQueuePort = { enqueueGroup };
    const registry: GroupRegistryPort = {
        listScheduledGroups: () => Promise.resolve([]),
        getGroup: (id) =>
            Promise.resolve(
                id === 'g1' ? createProgramsGroup({ id, name: 'G', status, sources: [] }) : null,
            ),
    };
    const service = new ScheduleProgramsGroupSyncService(registry, store, queue, {
        newId: () => 'run-1',
        now: () => NOW,
    });
    return { service, createQueued, markFailed, enqueueGroup, calls };
}

describe('ScheduleProgramsGroupSyncService.schedule', () => {
    it('creates a queued run before enqueue and returns runId', async () => {
        const { service, createQueued, enqueueGroup, calls } = setup();
        const result = await service.schedule({
            groupId: 'g1',
            changedSources: CHANGED,
            trigger: 'scheduled',
        });
        expect(result).toEqual({ runId: 'run-1' });
        expect(calls).toEqual(['createQueued', 'enqueueGroup']);
        expect(createQueued).toHaveBeenCalledWith({
            id: 'run-1',
            groupId: 'g1',
            trigger: 'scheduled',
            changedSources: CHANGED,
            now: NOW,
        });
        expect(enqueueGroup).toHaveBeenCalledWith({
            runId: 'run-1',
            groupId: 'g1',
            changedSources: CHANGED,
        });
    });

    it('passes previousRunId for retry trigger to run and job', async () => {
        const { service, createQueued, enqueueGroup } = setup();
        await service.schedule({
            groupId: 'g1',
            changedSources: CHANGED,
            trigger: 'retry',
            previousRunId: 'run-0',
        });
        expect(createQueued).toHaveBeenCalledWith(
            expect.objectContaining({ trigger: 'retry', previousRunId: 'run-0' }),
        );
        expect(enqueueGroup).toHaveBeenCalledWith(
            expect.objectContaining({ previousRunId: 'run-0' }),
        );
    });

    it('rejects an unknown group without creating a run', async () => {
        const { service, createQueued } = setup();
        await expect(
            service.schedule({ groupId: 'nope', changedSources: CHANGED, trigger: 'scheduled' }),
        ).rejects.toMatchObject({ code: 'GROUP_NOT_FOUND' });
        expect(createQueued).not.toHaveBeenCalled();
    });

    it('rejects a non-ready group without creating a run', async () => {
        const { service, createQueued } = setup('needs_matching');
        await expect(
            service.schedule({ groupId: 'g1', changedSources: CHANGED, trigger: 'scheduled' }),
        ).rejects.toMatchObject({ code: 'GROUP_NOT_RUNNABLE' });
        expect(createQueued).not.toHaveBeenCalled();
    });

    it('marks the run failed and rethrows when enqueue fails', async () => {
        const boom = new Error('redis down');
        const { service, markFailed } = setup('ready', boom);
        await expect(
            service.schedule({ groupId: 'g1', changedSources: CHANGED, trigger: 'scheduled' }),
        ).rejects.toBe(boom);
        expect(markFailed).toHaveBeenCalledWith({
            runId: 'run-1',
            failure: { code: 'ENQUEUE_FAILED', message: 'redis down', retryable: true },
        });
    });

    it('uses ProgramsSyncError type for rejections', async () => {
        const { service } = setup();
        await expect(
            service.schedule({ groupId: 'nope', changedSources: CHANGED, trigger: 'scheduled' }),
        ).rejects.toBeInstanceOf(ProgramsSyncError);
    });
});
