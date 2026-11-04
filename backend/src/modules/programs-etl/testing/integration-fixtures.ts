import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { migrate } from '../../../database/postgres/migrator';
import type { CatalogMutationPlan } from '../application/models/catalog-mutation';
import type { GroupSource } from '../application/models/programs-group';
import type { SourceFingerprint } from '../application/models/source-fingerprint';
import type { ScanProgramSourcesResult } from '../application/models/sync-commands';
import type {
    ProgramsAgentPort,
    SheetsReaderPort,
    SyncRunStorePort,
} from '../application/ports/programs-etl.ports';
import { ScheduleProgramsGroupSyncService } from '../application/services/schedule-programs-group-sync.service';
import { ScanProgramSourcesUseCase } from '../application/use-cases/scan-program-sources.use-case';
import { SyncProgramsGroupUseCase } from '../application/use-cases/sync-programs-group.use-case';
import { CatalogWriterRepository } from '../infrastructure/catalog-writer-repository';
import { JsonGroupRegistry } from '../infrastructure/json-group-registry';
import { PostgresSourceStateRepository } from '../infrastructure/postgres-source-state-repository';
import { PostgresSyncRunStore } from '../infrastructure/postgres-sync-run-store';
import { BullProgramsSyncQueue } from '../infrastructure/queue/bull-programs-sync-queue';
import {
    PROGRAMS_ETL_QUEUE_NAMES,
    programsSyncJobId,
} from '../infrastructure/queue/programs-etl-queue.constants';
import type {
    ScanSourcesJobData,
    SyncGroupJobData,
} from '../infrastructure/queue/programs-etl-queue.dto';
import { ScanSourcesProcessor } from '../interface/queue/scan-sources.processor';
import { SyncGroupProcessor } from '../interface/queue/sync-group.processor';

/** Prefix of `programsSyncJobId`, so tests can assert idempotent job ids. */
export const SYNC_JOB_ID_PREFIX = programsSyncJobId('');

const POLL_INTERVAL_MS = 50;
const WAIT_TIMEOUT_MS = 15_000;

const GROUPS_DEFINITION = {
    groups: [
        {
            id: 'g_ready',
            name: 'Ready group',
            status: 'ready',
            sheets: [sheet('book1', 10, 'First'), sheet('book2', 20, 'Second')],
        },
        {
            id: 'g_deferred',
            name: 'Deferred group',
            status: 'deferred',
            sheets: [sheet('book3', 30, 'Third')],
        },
    ],
};

function sheet(spreadsheetId: string, sheetId: number, title: string): Record<string, unknown> {
    return {
        book: spreadsheetId,
        spreadsheet_id: spreadsheetId,
        sheet_id: sheetId,
        title,
        url: `https://example.test/${spreadsheetId}#gid=${String(sheetId)}`,
    };
}

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil<T>(description: string, probe: () => Promise<T | undefined>): Promise<T> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    for (;;) {
        const value = await probe();
        if (value !== undefined) return value;
        if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}`);
        await sleep(POLL_INTERVAL_MS);
    }
}

/** Sheets mock: fingerprints are set per test, no Google API involved. */
export class FakeSheetsReader implements SheetsReaderPort {
    private hashes = new Map<string, string>();

    setHashes(hashes: Record<string, string>): void {
        this.hashes = new Map(Object.entries(hashes));
    }

    readFingerprints(sources: GroupSource[]): Promise<Map<string, SourceFingerprint>> {
        const result = new Map<string, SourceFingerprint>();
        for (const source of sources) {
            const value = this.hashes.get(source.sourceId);
            if (value !== undefined) result.set(source.sourceId, { value });
        }
        return Promise.resolve(result);
    }

    readRange(): Promise<never> {
        return Promise.reject(new Error('readRange is not used by the integration flow'));
    }
}

type AgentBehavior = (call: number) => CatalogMutationPlan;

/** Agent mock: returns scripted mutation plans or fails; records every call. */
export class FakeProgramsAgent implements ProgramsAgentPort {
    readonly calls: Parameters<ProgramsAgentPort['buildMutationPlan']>[0][] = [];
    private behavior: AgentBehavior = () => ({ operations: [] });

    respondWith(plan: () => CatalogMutationPlan): void {
        this.behavior = () => plan();
    }

    failWith(error: Error): void {
        this.behavior = () => {
            throw error;
        };
    }

    failTimesThenRespond(times: number, error: Error, plan: () => CatalogMutationPlan): void {
        this.behavior = (call) => {
            if (call <= times) throw error;
            return plan();
        };
    }

    reset(): void {
        this.calls.length = 0;
        this.behavior = () => ({ operations: [] });
    }

    buildMutationPlan(
        input: Parameters<ProgramsAgentPort['buildMutationPlan']>[0],
    ): Promise<CatalogMutationPlan> {
        this.calls.push(input);
        try {
            return Promise.resolve(this.behavior(this.calls.length));
        } catch (error) {
            return Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
    }
}

export interface IntegrationEnv {
    readonly sheets: FakeSheetsReader;
    readonly agent: FakeProgramsAgent;
    readonly runStore: SyncRunStorePort;
    readonly syncQueue: Queue<SyncGroupJobData>;
    runScan(): Promise<ScanProgramSourcesResult>;
    waitForRun(runId: string, status: 'succeeded' | 'failed'): Promise<void>;
    waitForJobFailure(runId: string): Promise<Job<SyncGroupJobData>>;
    promoteDelayedJob(runId: string): Promise<void>;
    count(table: string, where?: string): Promise<number>;
    fingerprints(sourceIds: string[]): Promise<Record<string, string | null>>;
    reset(): Promise<void>;
    close(): Promise<void>;
}

const loggerStub = {
    setContext: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
} as unknown as PinoLogger;

/**
 * Real PostgreSQL + Redis/BullMQ with real use cases, adapters and processors;
 * only Google Sheets and the LLM agent are mocked.
 */
export async function createIntegrationEnv(input: {
    adminUrl: string;
    redisUrl: string;
}): Promise<IntegrationEnv> {
    const dbName = `etl_it_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const admin = new Client({ connectionString: input.adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    await admin.end();
    const dbUrl = withDatabase(input.adminUrl, dbName);
    await migrate(dbUrl);
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    const pool: DatabasePool = await createPool(dbUrl);

    const prefix = `programs-etl-it-${randomUUID()}`;
    const connection = new Redis(input.redisUrl, { maxRetriesPerRequest: null });
    const scanQueue = new Queue<ScanSourcesJobData>(PROGRAMS_ETL_QUEUE_NAMES.SCAN, {
        connection,
        prefix,
    });
    const syncQueue = new Queue<SyncGroupJobData>(PROGRAMS_ETL_QUEUE_NAMES.SYNC, {
        connection,
        prefix,
    });
    const scanEvents = new QueueEvents(PROGRAMS_ETL_QUEUE_NAMES.SCAN, { connection, prefix });
    await scanEvents.waitUntilReady();

    const sheets = new FakeSheetsReader();
    const agent = new FakeProgramsAgent();
    const registry = new JsonGroupRegistry(GROUPS_DEFINITION);
    const runStore = new PostgresSyncRunStore(pool);
    const sourceState = new PostgresSourceStateRepository(pool);
    const writer = new CatalogWriterRepository(pool);
    const scheduler = new ScheduleProgramsGroupSyncService(
        registry,
        runStore,
        new BullProgramsSyncQueue(syncQueue),
        { newId: () => randomUUID(), now: () => new Date() },
    );
    const scanProcessor = new ScanSourcesProcessor(
        new ScanProgramSourcesUseCase(registry, sheets, sourceState, runStore, scheduler),
        loggerStub,
    );
    const syncProcessor = new SyncGroupProcessor(
        new SyncProgramsGroupUseCase(registry, runStore, agent, writer, sourceState),
        loggerStub,
    );
    const scanWorker = new Worker<ScanSourcesJobData>(
        PROGRAMS_ETL_QUEUE_NAMES.SCAN,
        (job) => scanProcessor.process(job),
        { connection, prefix },
    );
    const syncWorker = new Worker<SyncGroupJobData>(
        PROGRAMS_ETL_QUEUE_NAMES.SYNC,
        (job) => syncProcessor.process(job),
        { connection, prefix },
    );
    await Promise.all([scanWorker.waitUntilReady(), syncWorker.waitUntilReady()]);

    const syncJob = (runId: string): Promise<Job<SyncGroupJobData> | undefined> =>
        syncQueue.getJob(programsSyncJobId(runId));

    return {
        sheets,
        agent,
        runStore,
        syncQueue,
        async runScan() {
            const job = await scanQueue.add('scan-sources', {
                scheduledAt: new Date().toISOString(),
            });
            return (await job.waitUntilFinished(
                scanEvents,
                WAIT_TIMEOUT_MS,
            )) as ScanProgramSourcesResult;
        },
        async waitForRun(runId, status) {
            await waitUntil(`run ${runId} to become ${status}`, async () => {
                const run = await runStore.findById(runId);
                return run?.status === status ? true : undefined;
            });
        },
        async waitForJobFailure(runId) {
            return waitUntil(`sync job of run ${runId} to fail`, async () => {
                const job = await syncJob(runId);
                return job !== undefined && (await job.isFailed()) ? job : undefined;
            });
        },
        async promoteDelayedJob(runId) {
            const job = await waitUntil(`sync job of run ${runId} to be delayed`, async () => {
                const found = await syncJob(runId);
                return found !== undefined && (await found.isDelayed()) ? found : undefined;
            });
            await job.promote();
        },
        async count(table, where = 'true') {
            const result = await client.query<{ n: string }>(
                `SELECT count(*) AS n FROM ${table} WHERE ${where}`,
            );
            return Number(result.rows[0]?.n);
        },
        async fingerprints(sourceIds) {
            const found = await sourceState.findSuccessfulFingerprints(sourceIds);
            return Object.fromEntries(sourceIds.map((id) => [id, found.get(id)?.value ?? null]));
        },
        async reset() {
            await scanQueue.obliterate({ force: true });
            await syncQueue.obliterate({ force: true });
            await client.query(
                'TRUNCATE organization, source_sheet, programs_sync_run RESTART IDENTITY CASCADE',
            );
            sheets.setHashes({});
            agent.reset();
        },
        async close() {
            await Promise.all([scanWorker.close(), syncWorker.close()]);
            await scanEvents.close();
            await Promise.all([scanQueue.close(), syncQueue.close()]);
            connection.disconnect();
            await pool.end();
            await client.end();
            const cleanup = new Client({ connectionString: input.adminUrl });
            await cleanup.connect();
            await cleanup.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
            await cleanup.end();
        },
    };
}
