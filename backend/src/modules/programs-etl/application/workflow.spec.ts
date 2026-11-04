import { describe, expect, it } from 'vitest';
import type { ProgramsSyncRunRecord } from './models/programs-sync-run';
import {
    type ProgramsSyncErrorCode,
    ProgramsSyncError,
    isRetryableCode,
} from './errors/programs-sync.error';
import { createCatalogMutationPlan } from './models/catalog-mutation';
import { createProgramsGroup, isRunnableGroup } from './models/programs-group';
import { buildProgramMatchKey } from './models/program-match-key';
import {
    createQueuedRun,
    failRun,
    startRun,
    succeedRun,
    InvalidRunTransitionError,
} from './models/programs-sync-run';
import { createSourceFingerprint, createSourceReference } from './models/source-fingerprint';

const NOW = new Date('2026-11-04T10:00:00Z');
const LATER = new Date('2026-11-04T10:05:00Z');

function queued(): ProgramsSyncRunRecord {
    return createQueuedRun({
        id: 'run-1',
        groupId: 'synergy_spo',
        trigger: 'scheduled',
        changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
        now: NOW,
    });
}

describe('ProgramsSyncRunRecord transitions', () => {
    it('creates a queued run without previousRunId by default', () => {
        const run = queued();
        expect(run.status).toBe('queued');
        expect(run.previousRunId).toBeUndefined();
        expect(run.createdAt).toEqual(NOW);
        expect(run.startedAt).toBeUndefined();
    });

    it('keeps previousRunId for a retry run', () => {
        const run = createQueuedRun({
            id: 'run-2',
            groupId: 'g',
            trigger: 'retry',
            previousRunId: 'run-1',
            changedSources: [],
            now: NOW,
        });
        expect(run.previousRunId).toBe('run-1');
        expect(run.trigger).toBe('retry');
    });

    it('queued -> running -> succeeded', () => {
        const running = startRun(queued(), LATER);
        expect(running.status).toBe('running');
        expect(running.startedAt).toEqual(LATER);
        const done = succeedRun(running, LATER);
        expect(done.status).toBe('succeeded');
        expect(done.finishedAt).toEqual(LATER);
    });

    it('running -> failed stores the failure', () => {
        const failed = failRun(startRun(queued(), NOW), {
            failure: { code: 'AGENT_TIMEOUT', message: 'timeout', retryable: true },
            now: LATER,
        });
        expect(failed.status).toBe('failed');
        expect(failed.failure).toEqual({
            code: 'AGENT_TIMEOUT',
            message: 'timeout',
            retryable: true,
        });
    });

    it('queued -> failed is allowed (job cannot start)', () => {
        const failed = failRun(queued(), {
            failure: { code: 'GROUP_NOT_FOUND', message: 'x', retryable: false },
            now: LATER,
        });
        expect(failed.status).toBe('failed');
    });

    it('startRun is idempotent for a running run', () => {
        const running = startRun(queued(), NOW);
        expect(startRun(running, LATER)).toEqual(running);
    });

    it('does not mutate the input record', () => {
        const run = queued();
        startRun(run, LATER);
        expect(run.status).toBe('queued');
    });

    it('rejects succeeding a queued run', () => {
        expect(() => succeedRun(queued(), LATER)).toThrow(InvalidRunTransitionError);
    });

    it.each([
        ['succeeded', (r: ReturnType<typeof queued>) => succeedRun(startRun(r, NOW), NOW)],
        [
            'failed',
            (r: ReturnType<typeof queued>) =>
                failRun(r, { failure: { code: 'X', message: 'm', retryable: false }, now: NOW }),
        ],
    ])('does not reopen a %s run', (_name, finish) => {
        const finished = finish(queued());
        expect(() => startRun(finished, LATER)).toThrow(InvalidRunTransitionError);
        expect(() => succeedRun(finished, LATER)).toThrow(InvalidRunTransitionError);
        expect(() =>
            failRun(finished, {
                failure: { code: 'X', message: 'm', retryable: false },
                now: LATER,
            }),
        ).toThrow(InvalidRunTransitionError);
    });
});

describe('ProgramsGroup and GroupSource', () => {
    const source = {
        sourceId: '1abc:42',
        book: 'main',
        spreadsheetId: '1abc',
        sheetId: 42,
        title: 'СПО',
        role: 'catalog',
        url: 'https://example.test',
    };

    it('creates a group snapshot with sources', () => {
        const group = createProgramsGroup({
            id: 'g',
            name: 'G',
            status: 'ready',
            sources: [source],
        });
        expect(group.sources).toHaveLength(1);
        expect(group.note).toBeUndefined();
        expect(isRunnableGroup(group)).toBe(true);
    });

    it.each(['needs_matching', 'out_of_scope_schema', 'deferred'] as const)(
        'group with status %s is not runnable',
        (status) => {
            const group = createProgramsGroup({ id: 'g', name: 'G', status, sources: [] });
            expect(isRunnableGroup(group)).toBe(false);
        },
    );

    it('rejects an unknown status', () => {
        expect(() =>
            createProgramsGroup({ id: 'g', name: 'G', status: 'bogus', sources: [] }),
        ).toThrow(ProgramsSyncError);
    });
});

describe('fingerprints and provenance', () => {
    it('wraps a non-empty hash value', () => {
        expect(createSourceFingerprint('abc')).toEqual({ value: 'abc' });
    });

    it('rejects an empty fingerprint', () => {
        expect(() => createSourceFingerprint('')).toThrow(ProgramsSyncError);
    });

    it('creates a source reference with sorted unique row numbers', () => {
        expect(createSourceReference({ sourceId: 's', rowNumbers: [5, 2, 5] })).toEqual({
            sourceId: 's',
            rowNumbers: [2, 5],
        });
    });

    it('keeps ranges when provided', () => {
        expect(
            createSourceReference({ sourceId: 's', rowNumbers: [2], ranges: ['A2:C2'] }).ranges,
        ).toEqual(['A2:C2']);
    });

    it('rejects non-positive row numbers', () => {
        expect(() => createSourceReference({ sourceId: 's', rowNumbers: [0] })).toThrow(
            ProgramsSyncError,
        );
    });
});

describe('ProgramMatchKey', () => {
    it('builds the coded variant when directionCode is present', () => {
        expect(
            buildProgramMatchKey({
                organizationId: 'o',
                level: 'spo',
                directionCode: '09.02.07',
                profile: 'p',
                qualification: 'q',
                title: 'ignored',
            }),
        ).toEqual({
            kind: 'coded',
            organizationId: 'o',
            level: 'spo',
            directionCode: '09.02.07',
            profile: 'p',
            qualification: 'q',
        });
    });

    it('builds the coded variant without optional parts', () => {
        const key = buildProgramMatchKey({
            organizationId: 'o',
            level: 'bachelor',
            directionCode: '38.03.01',
        });
        expect(key).toEqual({
            kind: 'coded',
            organizationId: 'o',
            level: 'bachelor',
            directionCode: '38.03.01',
        });
    });

    it('builds the titled variant without directionCode', () => {
        expect(
            buildProgramMatchKey({ organizationId: 'o', level: 'short_course', title: 'Курс' }),
        ).toEqual({ kind: 'titled', organizationId: 'o', level: 'short_course', title: 'Курс' });
    });

    it('treats a blank directionCode as absent', () => {
        expect(
            buildProgramMatchKey({
                organizationId: 'o',
                level: 'kids',
                directionCode: '  ',
                title: 'T',
            }).kind,
        ).toBe('titled');
    });

    it('rejects titled key without title', () => {
        expect(() => buildProgramMatchKey({ organizationId: 'o', level: 'kids' })).toThrow(
            ProgramsSyncError,
        );
    });

    it('rejects an unknown level', () => {
        expect(() =>
            buildProgramMatchKey({ organizationId: 'o', level: 'nope', title: 'T' }),
        ).toThrow();
    });
});

describe('CatalogMutationPlan', () => {
    const ref = { sourceId: 's', rowNumbers: [2] };

    it('accepts create without recordId and update with recordId', () => {
        const plan = createCatalogMutationPlan([
            { kind: 'create', recordType: 'program', data: { title: 'T' }, sources: [ref] },
            { kind: 'update', recordType: 'offer', recordId: 'o1', data: {}, sources: [ref] },
        ]);
        expect(plan.operations).toHaveLength(2);
    });

    it('rejects update without recordId', () => {
        expect(() =>
            createCatalogMutationPlan([
                { kind: 'update', recordType: 'program', data: {}, sources: [ref] },
            ]),
        ).toThrow(ProgramsSyncError);
    });

    it('rejects create carrying a recordId (writer does not guess IDs)', () => {
        expect(() =>
            createCatalogMutationPlan([
                { kind: 'create', recordType: 'program', recordId: 'x', data: {}, sources: [ref] },
            ]),
        ).toThrow(ProgramsSyncError);
    });

    it('rejects delete operations', () => {
        expect(() =>
            createCatalogMutationPlan([
                { kind: 'delete', recordType: 'program', data: {}, sources: [ref] } as never,
            ]),
        ).toThrow(ProgramsSyncError);
    });

    it('allows an empty plan', () => {
        expect(createCatalogMutationPlan([]).operations).toEqual([]);
    });
});

describe('application errors', () => {
    it.each([
        ['GROUP_NOT_FOUND', false],
        ['GROUP_NOT_RUNNABLE', false],
        ['SOURCE_NOT_IN_GROUP', false],
        ['INVALID_RANGE', false],
        ['SOURCE_UNAVAILABLE', true],
        ['RATE_LIMITED', true],
        ['TIMEOUT', true],
        ['CATALOG_UNAVAILABLE', true],
        ['AGENT_TIMEOUT', true],
        ['AGENT_PROVIDER_ERROR', true],
        ['MUTATION_CONFLICT', false],
    ] as [ProgramsSyncErrorCode, boolean][])('%s retryable=%s', (code, retryable) => {
        expect(isRetryableCode(code)).toBe(retryable);
        const error = new ProgramsSyncError(code, 'msg');
        expect(error.code).toBe(code);
        expect(error.retryable).toBe(retryable);
        expect(error.toFailure()).toEqual({ code, message: 'msg', retryable });
    });

    it('RECORD_NOT_FOUND is non-retryable by default', () => {
        expect(new ProgramsSyncError('RECORD_NOT_FOUND', 'm').retryable).toBe(false);
    });
});
