import { describe, expect, it, vi } from 'vitest';
import { createProgramsGroup } from '../models/programs-group';
import type { GroupSource, ProgramsGroup } from '../models/programs-group';
import type { SourceFingerprint } from '../models/source-fingerprint';
import type {
    GroupRegistryPort,
    SheetsReaderPort,
    SourceStateRepositoryPort,
    SyncRunStorePort,
} from '../ports/programs-etl.ports';
import type { ScheduleProgramsGroupSyncService } from '../services/schedule-programs-group-sync.service';
import { ScanProgramSourcesUseCase } from './scan-program-sources.use-case';

const NOW = new Date('2026-11-04T10:00:00Z');

function source(sourceId: string): GroupSource {
    return {
        sourceId,
        book: 'b',
        spreadsheetId: 'sp',
        sheetId: 1,
        title: sourceId,
        url: `https://example.test/${sourceId}`,
    };
}

function group(id: string, sourceIds: string[], status = 'ready'): ProgramsGroup {
    return createProgramsGroup({ id, name: id, status, sources: sourceIds.map(source) });
}

const fp = (value: string): SourceFingerprint => ({ value });

interface Setup {
    useCase: ScanProgramSourcesUseCase;
    schedule: ReturnType<typeof vi.fn>;
    readFingerprints: ReturnType<typeof vi.fn>;
    markSuccessfullyProcessed: ReturnType<typeof vi.fn>;
}

function setup(input: {
    groups: ProgramsGroup[];
    observed: Record<string, string>;
    saved: Record<string, string | null>;
    active?: Record<string, { sourceId: string; observedHash: string }[]>;
    failSchedule?: string[];
}): Setup {
    const registry: GroupRegistryPort = {
        listScheduledGroups: () =>
            Promise.resolve(input.groups.filter((g) => g.status === 'ready')),
        getGroup: () => Promise.resolve(null),
    };
    const readFingerprints = vi.fn((sources: GroupSource[]) =>
        Promise.resolve(
            new Map(sources.map((s) => [s.sourceId, fp(input.observed[s.sourceId] ?? '')])),
        ),
    );
    const sheets = { readFingerprints } as unknown as SheetsReaderPort;
    const markSuccessfullyProcessed = vi.fn(() => Promise.resolve());
    const state = {
        findSuccessfulFingerprints: (ids: string[]) =>
            Promise.resolve(
                new Map(
                    ids.map((id) => {
                        const v = input.saved[id];
                        return [id, v == null ? null : fp(v)] as const;
                    }),
                ),
            ),
        markSuccessfullyProcessed,
    } as SourceStateRepositoryPort;
    let n = 0;
    const schedule = vi.fn((cmd: { groupId: string }) =>
        input.failSchedule?.includes(cmd.groupId) === true
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ runId: `run-${String(++n)}` }),
    );
    const runs = {
        list: (q: { groupId: string; status: string }) =>
            Promise.resolve({
                items:
                    input.active?.[q.groupId] === undefined || q.status !== 'queued'
                        ? []
                        : [{ id: `active-${q.groupId}` }],
            }),
        findById: (id: string) =>
            Promise.resolve({ changedSources: input.active?.[id.replace('active-', '')] ?? [] }),
    } as unknown as SyncRunStorePort;
    const scheduler = { schedule } as unknown as ScheduleProgramsGroupSyncService;
    const useCase = new ScanProgramSourcesUseCase(registry, sheets, state, runs, scheduler);
    return { useCase, schedule, readFingerprints, markSuccessfullyProcessed };
}

describe('ScanProgramSourcesUseCase.execute', () => {
    it('scans only ready groups', async () => {
        const s = setup({
            groups: [group('g1', ['a']), group('g2', ['b'], 'deferred')],
            observed: { a: 'h1', b: 'h2' },
            saved: { a: 'h1', b: null },
        });
        const result = await s.useCase.execute(NOW);
        expect(s.readFingerprints.mock.calls.flat().flat()).toHaveLength(1);
        expect(result).toEqual({ scannedSources: 1, changedSources: 0, enqueuedGroups: 0 });
    });

    it('does not create a run for an unchanged sheet', async () => {
        const s = setup({
            groups: [group('g1', ['a'])],
            observed: { a: 'h1' },
            saved: { a: 'h1' },
        });
        const result = await s.useCase.execute(NOW);
        expect(s.schedule).not.toHaveBeenCalled();
        expect(result).toEqual({ scannedSources: 1, changedSources: 0, enqueuedGroups: 0 });
    });

    it('treats a never processed sheet as changed', async () => {
        const s = setup({
            groups: [group('g1', ['a'])],
            observed: { a: 'h1' },
            saved: { a: null },
        });
        await s.useCase.execute(NOW);
        expect(s.schedule).toHaveBeenCalledWith({
            groupId: 'g1',
            changedSources: [{ sourceId: 'a', observedHash: 'h1' }],
            trigger: 'scheduled',
        });
    });

    it('groups changed sheets of one group into a single job', async () => {
        const s = setup({
            groups: [group('g1', ['a', 'b', 'c'])],
            observed: { a: 'n1', b: 'n2', c: 'same' },
            saved: { a: 'o1', b: 'o2', c: 'same' },
        });
        const result = await s.useCase.execute(NOW);
        expect(s.schedule).toHaveBeenCalledTimes(1);
        expect(s.schedule).toHaveBeenCalledWith({
            groupId: 'g1',
            changedSources: [
                { sourceId: 'a', observedHash: 'n1' },
                { sourceId: 'b', observedHash: 'n2' },
            ],
            trigger: 'scheduled',
        });
        expect(result).toEqual({ scannedSources: 3, changedSources: 2, enqueuedGroups: 1 });
    });

    it('creates separate runs for several changed groups', async () => {
        const s = setup({
            groups: [group('g1', ['a']), group('g2', ['b'])],
            observed: { a: 'n1', b: 'n2' },
            saved: { a: 'o1', b: 'o2' },
        });
        const result = await s.useCase.execute(NOW);
        expect(s.schedule).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ scannedSources: 2, changedSources: 2, enqueuedGroups: 2 });
    });

    it('does not advance the successful fingerprint and re-detects change after a failed run', async () => {
        const s = setup({
            groups: [group('g1', ['a'])],
            observed: { a: 'n1' },
            saved: { a: 'o1' },
        });
        await s.useCase.execute(NOW);
        await s.useCase.execute(NOW);
        expect(s.markSuccessfullyProcessed).not.toHaveBeenCalled();
        expect(s.schedule).toHaveBeenCalledTimes(2);
    });

    it('skips a group that already has an active run for the same hashes', async () => {
        const s = setup({
            groups: [group('g1', ['a']), group('g2', ['b'])],
            observed: { a: 'n1', b: 'n2' },
            saved: { a: 'o1', b: 'o2' },
            active: { g1: [{ sourceId: 'a', observedHash: 'n1' }] },
        });
        const result = await s.useCase.execute(NOW);
        expect(s.schedule).toHaveBeenCalledTimes(1);
        expect(s.schedule.mock.calls[0]?.[0]).toMatchObject({ groupId: 'g2' });
        expect(result.enqueuedGroups).toBe(1);
    });

    it('schedules again when the active run was for different hashes', async () => {
        const s = setup({
            groups: [group('g1', ['a'])],
            observed: { a: 'n2' },
            saved: { a: 'o1' },
            active: { g1: [{ sourceId: 'a', observedHash: 'n1' }] },
        });
        await s.useCase.execute(NOW);
        expect(s.schedule).toHaveBeenCalledTimes(1);
    });

    it('schedules the remaining groups when one group fails, then reports the failure', async () => {
        const s = setup({
            groups: [group('g1', ['a']), group('g2', ['b'])],
            observed: { a: 'n1', b: 'n2' },
            saved: { a: 'o1', b: 'o2' },
            failSchedule: ['g1'],
        });
        await expect(s.useCase.execute(NOW)).rejects.toThrow('boom');
        expect(s.schedule).toHaveBeenCalledTimes(2);
    });
});
