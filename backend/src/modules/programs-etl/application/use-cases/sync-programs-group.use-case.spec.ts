import { describe, expect, it, vi } from 'vitest';
import { ProgramsSyncError } from '../errors/programs-sync.error';
import { createCatalogMutationPlan } from '../models/catalog-mutation';
import { createProgramsGroup } from '../models/programs-group';
import type { ProgramsGroup } from '../models/programs-group';
import type { SyncProgramsGroupCommand } from '../models/sync-commands';
import { SyncProgramsGroupUseCase } from './sync-programs-group.use-case';

const command: SyncProgramsGroupCommand = {
    runId: 'run-1',
    groupId: 'g1',
    changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
};

const readyGroup: ProgramsGroup = createProgramsGroup({
    id: 'g1',
    name: 'g1',
    status: 'ready',
    sources: [],
});

const plan = createCatalogMutationPlan([
    { kind: 'create', recordType: 'organization', localKey: 'o', data: {}, sources: [] },
]);

interface Setup {
    useCase: SyncProgramsGroupUseCase;
    calls: string[];
    markFailed: ReturnType<typeof vi.fn>;
    markSucceeded: ReturnType<typeof vi.fn>;
    applyPlan: ReturnType<typeof vi.fn>;
    buildMutationPlan: ReturnType<typeof vi.fn>;
    markSuccessfullyProcessed: ReturnType<typeof vi.fn>;
}

function setup(
    overrides: {
        group?: ProgramsGroup | null;
        agent?: () => Promise<unknown>;
        writer?: () => Promise<unknown>;
    } = {},
): Setup {
    const calls: string[] = [];
    const log = (name: string, value: unknown): ReturnType<typeof vi.fn> =>
        vi.fn((..._args: unknown[]) => {
            calls.push(name);
            return Promise.resolve(value);
        });
    const getGroup = log('getGroup', overrides.group === undefined ? readyGroup : overrides.group);
    const markRunning = log('markRunning', undefined);
    const markSucceeded = log('markSucceeded', undefined);
    const markFailed = log('markFailed', undefined);
    const buildMutationPlan = vi.fn((..._args: unknown[]) => {
        calls.push('agent');
        return overrides.agent ? overrides.agent() : Promise.resolve(plan);
    });
    const applyPlan = vi.fn((..._args: unknown[]) => {
        calls.push('writer');
        return overrides.writer ? overrides.writer() : Promise.resolve({ created: 2, updated: 1 });
    });
    const markSuccessfullyProcessed = log('advance', undefined);
    const useCase = new SyncProgramsGroupUseCase(
        { getGroup, listScheduledGroups: vi.fn() } as never,
        { markRunning, markSucceeded, markFailed } as never,
        { buildMutationPlan } as never,
        { applyPlan } as never,
        { markSuccessfullyProcessed, findSuccessfulFingerprints: vi.fn() } as never,
    );
    return {
        useCase,
        calls,
        markFailed,
        markSucceeded,
        applyPlan,
        buildMutationPlan,
        markSuccessfullyProcessed,
    };
}

describe('SyncProgramsGroupUseCase.execute', () => {
    it('runs the full cycle and advances fingerprints only after the writer', async () => {
        const s = setup();
        const result = await s.useCase.execute(command);
        expect(result).toEqual({ runId: 'run-1', created: 2, updated: 1 });
        expect(s.calls).toEqual([
            'getGroup',
            'markRunning',
            'agent',
            'writer',
            'advance',
            'markSucceeded',
        ]);
        expect(s.buildMutationPlan).toHaveBeenCalledWith({
            runId: 'run-1',
            group: readyGroup,
            changedSources: command.changedSources,
        });
        expect(s.applyPlan).toHaveBeenCalledWith({ runId: 'run-1', groupId: 'g1', plan });
        expect(s.markSuccessfullyProcessed).toHaveBeenCalledWith({
            runId: 'run-1',
            fingerprints: command.changedSources,
        });
    });

    it('marks failed and keeps fingerprints on Sheets error from the agent', async () => {
        const s = setup({
            agent: () => Promise.reject(new ProgramsSyncError('SOURCE_UNAVAILABLE', 'sheets down')),
        });
        await expect(s.useCase.execute(command)).rejects.toMatchObject({
            code: 'SOURCE_UNAVAILABLE',
        });
        expect(s.markFailed).toHaveBeenCalledWith({
            runId: 'run-1',
            failure: { code: 'SOURCE_UNAVAILABLE', message: 'sheets down', retryable: true },
        });
        expect(s.applyPlan).not.toHaveBeenCalled();
        expect(s.markSuccessfullyProcessed).not.toHaveBeenCalled();
        expect(s.markSucceeded).not.toHaveBeenCalled();
    });

    it('marks failed and keeps fingerprints on agent error', async () => {
        const s = setup({
            agent: () => Promise.reject(new ProgramsSyncError('AGENT_TIMEOUT', 'slow')),
        });
        await expect(s.useCase.execute(command)).rejects.toMatchObject({ code: 'AGENT_TIMEOUT' });
        expect(s.markFailed).toHaveBeenCalledOnce();
        expect(s.markSuccessfullyProcessed).not.toHaveBeenCalled();
    });

    it('marks failed and keeps fingerprints on writer error', async () => {
        const s = setup({ writer: () => Promise.reject(new Error('db boom')) });
        await expect(s.useCase.execute(command)).rejects.toThrow('db boom');
        expect(s.markFailed).toHaveBeenCalledWith({
            runId: 'run-1',
            failure: { code: 'UNEXPECTED_ERROR', message: 'db boom', retryable: false },
        });
        expect(s.markSuccessfullyProcessed).not.toHaveBeenCalled();
        expect(s.markSucceeded).not.toHaveBeenCalled();
    });

    it('fails the run when the group is missing or not runnable', async () => {
        const missing = setup({ group: null });
        await expect(missing.useCase.execute(command)).rejects.toMatchObject({
            code: 'GROUP_NOT_FOUND',
        });
        expect(missing.markFailed).toHaveBeenCalledOnce();
        expect(missing.buildMutationPlan).not.toHaveBeenCalled();

        const deferred = setup({
            group: createProgramsGroup({ id: 'g1', name: 'g1', status: 'deferred', sources: [] }),
        });
        await expect(deferred.useCase.execute(command)).rejects.toMatchObject({
            code: 'GROUP_NOT_RUNNABLE',
        });
        expect(deferred.buildMutationPlan).not.toHaveBeenCalled();
    });
    it('keeps the run open on a retryable failure that BullMQ will retry', async () => {
        const s = setup({
            agent: () => Promise.reject(new ProgramsSyncError('AGENT_TIMEOUT', 'slow')),
        });
        await expect(s.useCase.execute({ ...command, finalAttempt: false })).rejects.toMatchObject({
            code: 'AGENT_TIMEOUT',
        });
        expect(s.markFailed).not.toHaveBeenCalled();
        expect(s.markSuccessfullyProcessed).not.toHaveBeenCalled();
    });

    it('fails the run on a permanent error even when attempts remain', async () => {
        const s = setup({
            agent: () => Promise.reject(new ProgramsSyncError('MUTATION_CONFLICT', 'bad plan')),
        });
        await expect(s.useCase.execute({ ...command, finalAttempt: false })).rejects.toMatchObject({
            code: 'MUTATION_CONFLICT',
        });
        expect(s.markFailed).toHaveBeenCalledOnce();
    });
});
