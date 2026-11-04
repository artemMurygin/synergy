import { describe, expect, it, vi } from 'vitest';
import { ProgramsSyncError } from './errors/programs-sync.error';
import { createCatalogMutationPlan } from './models/catalog-mutation';
import { createProgramsGroup } from './models/programs-group';
import type { ProgramsSyncLogEntry } from './ports/programs-etl.ports';
import { ScanProgramSourcesUseCase } from './use-cases/scan-program-sources.use-case';
import { SyncProgramsGroupUseCase } from './use-cases/sync-programs-group.use-case';

const group = createProgramsGroup({
    id: 'g1',
    name: 'g1',
    status: 'ready',
    sources: [
        {
            sourceId: 's1',
            spreadsheetId: 'sp',
            sheetId: 1,
            title: 'T',
            book: 'B',
            url: 'https://x',
        },
    ],
});
const plan = createCatalogMutationPlan([
    {
        kind: 'create',
        recordType: 'organization',
        localKey: 'o',
        data: { secret: 'CELL' },
        sources: [],
    },
]);
interface Metrics {
    recordScan: ReturnType<typeof vi.fn>;
    recordRun: ReturnType<typeof vi.fn>;
    recordToolCall: ReturnType<typeof vi.fn>;
}

const command = {
    runId: 'run-1',
    groupId: 'g1',
    trigger: 'retry' as const,
    changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
};

function syncSetup(overrides: { agent?: () => Promise<unknown> } = {}): {
    useCase: SyncProgramsGroupUseCase;
    metrics: Metrics;
    entries: ProgramsSyncLogEntry[];
} {
    const metrics = { recordScan: vi.fn(), recordRun: vi.fn(), recordToolCall: vi.fn() };
    const entries: ProgramsSyncLogEntry[] = [];
    let tick = 0;
    const useCase = new SyncProgramsGroupUseCase(
        { getGroup: vi.fn().mockResolvedValue(group) } as never,
        {
            markRunning: vi.fn().mockResolvedValue(undefined),
            markSucceeded: vi.fn().mockResolvedValue(undefined),
            markFailed: vi.fn().mockResolvedValue(undefined),
        } as never,
        {
            buildMutationPlan: vi.fn(() =>
                overrides.agent ? overrides.agent() : Promise.resolve(plan),
            ),
        } as never,
        { applyPlan: vi.fn().mockResolvedValue({ created: 1, updated: 0 }) },
        { markSuccessfullyProcessed: vi.fn().mockResolvedValue(undefined) } as never,
        {
            metrics,
            logger: { log: (e: ProgramsSyncLogEntry) => entries.push(e) },
            now: () => (tick += 1000),
        },
    );
    return { useCase, metrics, entries };
}

describe('SyncProgramsGroupUseCase observability', () => {
    it('logs each phase with ids, duration and outcome and records a succeeded run', async () => {
        const { useCase, metrics, entries } = syncSetup();
        await useCase.execute(command);

        expect(entries.map((e) => e.phase)).toEqual(['agent', 'write', 'fingerprint', 'run']);
        for (const entry of entries) {
            expect(entry).toMatchObject({ groupId: 'g1', runId: 'run-1', outcome: 'success' });
            expect(entry.durationMs).toBeGreaterThan(0);
        }
        expect(metrics.recordRun).toHaveBeenCalledWith({
            status: 'succeeded',
            trigger: 'retry',
            durationSeconds: expect.any(Number) as number,
        });
    });

    it('logs failure with error_code and records a failed run', async () => {
        const { useCase, metrics, entries } = syncSetup({
            agent: () => Promise.reject(new ProgramsSyncError('AGENT_TIMEOUT', 'slow')),
        });
        await expect(useCase.execute(command)).rejects.toThrow();

        expect(entries.map((e) => [e.phase, e.outcome, e.errorCode])).toEqual([
            ['agent', 'failure', 'AGENT_TIMEOUT'],
            ['run', 'failure', 'AGENT_TIMEOUT'],
        ]);
        expect(metrics.recordRun).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'failed', trigger: 'retry' }),
        );
    });

    it('does not leak plan data, cell values or prompts into log entries', async () => {
        const { useCase, entries } = syncSetup();
        await useCase.execute(command);
        expect(JSON.stringify(entries)).not.toContain('CELL');
    });
});

function scanSetup(failRegistry = false): {
    useCase: ScanProgramSourcesUseCase;
    metrics: Metrics;
    entries: ProgramsSyncLogEntry[];
} {
    const metrics = { recordScan: vi.fn(), recordRun: vi.fn(), recordToolCall: vi.fn() };
    const entries: ProgramsSyncLogEntry[] = [];
    const useCase = new ScanProgramSourcesUseCase(
        {
            listScheduledGroups: failRegistry
                ? vi.fn().mockRejectedValue(new ProgramsSyncError('SOURCE_UNAVAILABLE', 'down'))
                : vi.fn().mockResolvedValue([group]),
        } as never,
        {
            readFingerprints: vi.fn().mockResolvedValue(new Map([['s1', { value: 'new' }]])),
        } as never,
        { findSuccessfulFingerprints: vi.fn().mockResolvedValue(new Map()) } as never,
        { list: vi.fn().mockResolvedValue({ items: [] }) } as never,
        { schedule: vi.fn().mockResolvedValue(undefined) } as never,
        { metrics, logger: { log: (e: ProgramsSyncLogEntry) => entries.push(e) } },
    );
    return { useCase, metrics, entries };
}

describe('ScanProgramSourcesUseCase observability', () => {
    it('records a successful scan with the changed sources count', async () => {
        const { useCase, metrics, entries } = scanSetup();
        await useCase.execute(new Date());

        expect(metrics.recordScan).toHaveBeenCalledWith({ outcome: 'success', changedSources: 1 });
        expect(entries).toEqual([
            expect.objectContaining({ phase: 'scan', outcome: 'success', changedSources: 1 }),
        ]);
    });

    it('records a failed scan and rethrows', async () => {
        const { useCase, metrics, entries } = scanSetup(true);
        await expect(useCase.execute(new Date())).rejects.toThrow();

        expect(metrics.recordScan).toHaveBeenCalledWith({ outcome: 'failure', changedSources: 0 });
        expect(entries[0]).toMatchObject({
            phase: 'scan',
            outcome: 'failure',
            errorCode: 'SOURCE_UNAVAILABLE',
        });
    });
});
