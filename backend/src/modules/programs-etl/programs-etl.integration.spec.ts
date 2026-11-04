import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProgramsSyncError } from './application/errors/programs-sync.error';
import {
    createCatalogMutationPlan,
    type CatalogMutationPlan,
} from './application/models/catalog-mutation';
import {
    createIntegrationEnv,
    SYNC_JOB_ID_PREFIX,
    type IntegrationEnv,
} from './testing/integration-fixtures';

// Интеграционный тест: нужны чистая PostgreSQL с pgvector и Redis.
// PROGRAMS_ETL_TEST_ADMIN_URL и PROGRAMS_ETL_TEST_REDIS_URL; без них тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;
const redisUrl = process.env.PROGRAMS_ETL_TEST_REDIS_URL;

const READY_SOURCES = ['book1:10', 'book2:20'];

const happyPlan = (): CatalogMutationPlan =>
    createCatalogMutationPlan([
        {
            kind: 'create',
            recordType: 'organization',
            localKey: 'org',
            data: { kind: 'university', name: 'Synergy' },
            sources: [{ sourceId: 'book1:10', rowNumbers: [2] }],
        },
        {
            kind: 'create',
            recordType: 'program',
            data: {
                organizationId: { ref: 'org' },
                level: 'bachelor',
                title: 'Информатика',
                directionCode: '09.03.01',
            },
            sources: [
                { sourceId: 'book1:10', rowNumbers: [2, 3] },
                { sourceId: 'book2:20', rowNumbers: [7] },
            ],
        },
    ]);

describe.skipIf(adminUrl === undefined || redisUrl === undefined)(
    'programs-etl group flow (integration)',
    () => {
        let env: IntegrationEnv;

        beforeAll(async () => {
            env = await createIntegrationEnv({
                adminUrl: adminUrl ?? '',
                redisUrl: redisUrl ?? '',
            });
        }, 60_000);

        afterAll(async () => {
            await env.close();
        });

        beforeEach(async () => {
            await env.reset();
        });

        it('hourly scan -> one group job -> catalog, source links and fingerprints', async () => {
            env.sheets.setHashes({ 'book1:10': 'h1', 'book2:20': 'h2', 'book3:30': 'h3' });
            env.agent.respondWith(happyPlan);

            const scan = await env.runScan();
            expect(scan).toEqual({ scannedSources: 2, changedSources: 2, enqueuedGroups: 1 });

            const jobs = await env.syncQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
            expect(jobs).toHaveLength(1);
            const job = jobs[0];
            const runId = job.data.runId;
            expect(job.id).toBe(`${SYNC_JOB_ID_PREFIX}${runId}`);
            expect(job.data.groupId).toBe('g_ready');
            expect(job.data.changedSources).toEqual([
                { sourceId: 'book1:10', observedHash: 'h1' },
                { sourceId: 'book2:20', observedHash: 'h2' },
            ]);

            await env.waitForRun(runId, 'succeeded');
            expect(env.agent.calls).toHaveLength(1);
            expect(await env.count('program', `direction_code = '09.03.01'`)).toBe(1);
            expect(await env.count('program_source')).toBe(3);
            expect(
                await env.count(
                    'program_source',
                    `group_id = 'g_ready' AND last_seen_run_id = '${runId}'`,
                ),
            ).toBe(3);
            expect(await env.fingerprints(READY_SOURCES)).toEqual({
                'book1:10': 'h1',
                'book2:20': 'h2',
            });

            // Nothing changed since the successful run: the next scan stays quiet.
            expect(await env.runScan()).toEqual({
                scannedSources: 2,
                changedSources: 0,
                enqueuedGroups: 0,
            });
            expect(await env.syncQueue.getJobs(['waiting', 'active', 'completed'])).toHaveLength(1);
        }, 30_000);

        it('failed agent keeps the fingerprint so the next scan detects the change again', async () => {
            env.sheets.setHashes({ 'book1:10': 'h1', 'book2:20': 'h2' });
            env.agent.failWith(
                new ProgramsSyncError('INVALID_WORKFLOW_DATA', 'agent returned a broken plan'),
            );

            await env.runScan();
            const [job] = await env.syncQueue.getJobs(['waiting', 'active', 'failed']);
            const runId = job.data.runId;
            await env.waitForRun(runId, 'failed');

            const run = await env.runStore.findById(runId);
            expect(run?.failure).toMatchObject({
                code: 'INVALID_WORKFLOW_DATA',
                retryable: false,
            });
            // Non-retryable failure stops BullMQ attempts immediately.
            const failed = await env.waitForJobFailure(runId);
            expect(failed.attemptsMade).toBe(1);
            expect(await env.fingerprints(READY_SOURCES)).toEqual({
                'book1:10': null,
                'book2:20': null,
            });
            expect(await env.count('program')).toBe(0);

            env.agent.respondWith(happyPlan);
            expect(await env.runScan()).toMatchObject({ enqueuedGroups: 1 });
            const runs = await env.runStore.list({ groupId: 'g_ready', limit: 10 });
            expect(runs.items).toHaveLength(2);
        }, 30_000);

        it('BullMQ retries a transient failure inside the same run', async () => {
            env.sheets.setHashes({ 'book1:10': 'h1', 'book2:20': 'h2' });
            env.agent.failTimesThenRespond(
                1,
                new ProgramsSyncError('AGENT_PROVIDER_ERROR', 'provider is unavailable'),
                happyPlan,
            );

            await env.runScan();
            const [job] = await env.syncQueue.getJobs(['waiting', 'active', 'delayed']);
            const runId = job.data.runId;

            // First attempt fails and BullMQ schedules a backoff; skip the wait.
            await env.promoteDelayedJob(runId);
            await env.waitForRun(runId, 'succeeded');

            const finished = await env.syncQueue.getJob(`${SYNC_JOB_ID_PREFIX}${runId}`);
            expect(finished?.attemptsMade).toBe(2);
            expect(env.agent.calls).toHaveLength(2);
            const runs = await env.runStore.list({ groupId: 'g_ready', limit: 10 });
            expect(runs.items).toHaveLength(1);
            expect(await env.count('program')).toBe(1);
            expect(await env.fingerprints(READY_SOURCES)).toEqual({
                'book1:10': 'h1',
                'book2:20': 'h2',
            });
        }, 30_000);
    },
);
