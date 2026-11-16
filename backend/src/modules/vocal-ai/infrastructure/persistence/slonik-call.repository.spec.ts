import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../../../database/postgres/migrator';
import { TransactionRunner } from '../../../../database/postgres/transaction-runner';
import { Call } from '../../domain/entities/call.entity';
import { CallMetricScore } from '../../domain/entities/call-metric-score.entity';
import { CallSummary } from '../../domain/entities/call-summary.entity';
import { CallTag } from '../../domain/entities/call-tag.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { CallRepository } from './slonik-call.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

interface BuildCallOptions {
    callId: number;
    projectId?: string;
    manager?: string | null;
    callCreatedAt?: Date | null;
    totalScore?: number | null;
    maxScore?: number | null;
    metricScores?: CallMetricScore[];
    tags?: CallTag[];
    summaries?: CallSummary[];
}

function buildCall(options: BuildCallOptions): Call {
    const call = Call.create({
        callId: new CallId(options.callId),
        projectId: options.projectId ?? 'project-1',
        manager: options.manager ?? 'Иванов',
        client: 'Клиент',
        callType: 'incoming',
        callCreatedAt: options.callCreatedAt ?? new Date('2026-01-10T10:00:00Z'),
        callCompletedAt: new Date('2026-01-10T10:05:00Z'),
        scoredAt: null,
        rescoredAt: null,
        durationSeconds: 300,
        totalScore: options.totalScore ?? null,
        maxScore: options.maxScore ?? null,
    });
    call.replaceChildren(options.metricScores ?? [], options.tags ?? [], options.summaries ?? []);
    return call;
}

function metricScore(
    callId: number,
    metricId: string,
    scoreValue = 5,
    maxScore = 10,
): CallMetricScore {
    return new CallMetricScore({
        callId,
        metricId,
        metricTitle: `Metric ${metricId}`,
        scoreValue,
        maxScore,
        reason: null,
        recommendations: null,
        isException: false,
    });
}

function tag(callId: number, tagId: string, value = 'v1'): CallTag {
    return new CallTag({ callId, tagId, tagTitle: `Tag ${tagId}`, value, valueDescription: null });
}

function summary(callId: number, title = 'Итог'): CallSummary {
    return new CallSummary({ callId, summaryTitle: title, summaryText: `text-${title}` });
}

describe.skipIf(adminUrl === undefined)('CallRepository', () => {
    const dbName = `call_repo_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;
    let repository: CallRepository;

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        const dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        pool = await createPool(dbUrl);
        transactions = new TransactionRunner(
            pool,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        repository = new CallRepository(
            transactions,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    beforeEach(async () => {
        await client.query('DELETE FROM vocal_ai_calls');
        await client.query('DELETE FROM vocal_ai_projects');
    });

    describe('upsertMany', () => {
        it('inserts new calls with their children', async () => {
            const call = buildCall({
                callId: 1,
                metricScores: [metricScore(1, 'm1')],
                tags: [tag(1, 't1')],
                summaries: [summary(1)],
            });

            await repository.upsertMany([call]);

            const [found] = await repository.findByFilter({});
            expect(found.callId.value).toBe(1);
            expect(found.metricScores.map((s) => s.metricId)).toEqual(['m1']);
            expect(found.tags.map((t) => t.tagId)).toEqual(['t1']);
            expect(found.summaries.map((s) => s.summaryTitle)).toEqual(['Итог']);
        });

        it('fully replaces children of an existing call on re-upsert with a different set', async () => {
            await repository.upsertMany([
                buildCall({
                    callId: 2,
                    metricScores: [metricScore(2, 'm1'), metricScore(2, 'm2')],
                    tags: [tag(2, 't1')],
                }),
            ]);

            await repository.upsertMany([
                buildCall({ callId: 2, manager: 'Петров', metricScores: [metricScore(2, 'm3')] }),
            ]);

            const [found] = await repository.findByFilter({});
            expect(found.manager).toBe('Петров');
            expect(found.metricScores.map((s) => s.metricId)).toEqual(['m3']);
            expect(found.tags).toEqual([]);
        });

        it('does not touch calls not included in the current upsert', async () => {
            await repository.upsertMany([
                buildCall({ callId: 3 }),
                buildCall({ callId: 4, manager: 'Сидоров' }),
            ]);

            await repository.upsertMany([buildCall({ callId: 3, manager: 'Обновлён' })]);

            const calls = await repository.findByFilter({});
            const byId = new Map(calls.map((c) => [c.callId.value, c]));
            expect(byId.get(3)?.manager).toBe('Обновлён');
            expect(byId.get(4)?.manager).toBe('Сидоров');
        });

        it('does nothing for an empty list', async () => {
            await expect(repository.upsertMany([])).resolves.toBeUndefined();
        });
    });

    describe('findByFilter', () => {
        beforeEach(async () => {
            await repository.upsertMany([
                buildCall({
                    callId: 10,
                    projectId: 'project-a',
                    manager: 'Иванов',
                    callCreatedAt: new Date('2026-01-01T00:00:00Z'),
                    totalScore: 9,
                    maxScore: 10,
                    tags: [tag(10, 'quality')],
                    metricScores: [metricScore(10, 'greeting')],
                }),
                buildCall({
                    callId: 11,
                    projectId: 'project-a',
                    manager: 'Петров',
                    callCreatedAt: new Date('2026-02-01T00:00:00Z'),
                    totalScore: 3,
                    maxScore: 10,
                    tags: [tag(11, 'escalation')],
                    metricScores: [metricScore(11, 'closing')],
                }),
                buildCall({
                    callId: 12,
                    projectId: 'project-b',
                    manager: 'Иванов',
                    callCreatedAt: new Date('2026-01-15T00:00:00Z'),
                    totalScore: 5,
                    maxScore: 10,
                }),
            ]);
        });

        it('filters by projectId', async () => {
            const calls = await repository.findByFilter({ projectId: 'project-a' });
            expect(calls.map((c) => c.callId.value).sort()).toEqual([10, 11]);
        });

        it('filters by manager', async () => {
            const calls = await repository.findByFilter({ manager: 'Иванов' });
            expect(calls.map((c) => c.callId.value).sort()).toEqual([10, 12]);
        });

        it('filters by call date range', async () => {
            const calls = await repository.findByFilter({
                callDateFrom: new Date('2026-01-10T00:00:00Z'),
                callDateTo: new Date('2026-01-31T23:59:59Z'),
            });
            expect(calls.map((c) => c.callId.value)).toEqual([12]);
        });

        it('filters by totalScore range', async () => {
            const calls = await repository.findByFilter({ totalScoreMin: 4, totalScoreMax: 9 });
            expect(calls.map((c) => c.callId.value).sort()).toEqual([10, 12]);
        });

        it('filters by tagId', async () => {
            const calls = await repository.findByFilter({ tagId: 'escalation' });
            expect(calls.map((c) => c.callId.value)).toEqual([11]);
        });

        it('filters by metricId', async () => {
            const calls = await repository.findByFilter({ metricId: 'greeting' });
            expect(calls.map((c) => c.callId.value)).toEqual([10]);
        });

        it('combines filters with AND', async () => {
            const calls = await repository.findByFilter({
                projectId: 'project-a',
                manager: 'Петров',
            });
            expect(calls.map((c) => c.callId.value)).toEqual([11]);
        });

        it('returns an empty list when nothing matches', async () => {
            const calls = await repository.findByFilter({ projectId: 'unknown-project' });
            expect(calls).toEqual([]);
        });

        it('caps the result size by the given limit', async () => {
            const calls = await repository.findByFilter({ projectId: 'project-a', limit: 1 });
            expect(calls).toHaveLength(1);
        });

        it('caps the result size at the hard maximum regardless of a larger requested limit', async () => {
            const calls = await repository.findByFilter({ limit: 100_000 });
            expect(calls.length).toBeLessThanOrEqual(500);
        });
    });

    describe('aggregateStats', () => {
        beforeEach(async () => {
            await repository.upsertMany([
                buildCall({ callId: 20, projectId: 'project-a', totalScore: 9, maxScore: 10 }),
                buildCall({ callId: 21, projectId: 'project-a', totalScore: 2, maxScore: 10 }),
                buildCall({ callId: 22, projectId: 'project-b', totalScore: 8, maxScore: 10 }),
            ]);
        });

        it('counts calls and averages totalScore for the given filter', async () => {
            const stats = await repository.aggregateStats({ projectId: 'project-a' });
            expect(stats.callCount).toBe(2);
            expect(stats.averageScore).toBeCloseTo(5.5, 5);
        });

        it('computes the share of problematic calls (totalScore below half of maxScore)', async () => {
            const stats = await repository.aggregateStats({ projectId: 'project-a' });
            expect(stats.problematicShare).toBeCloseTo(0.5, 5);
        });

        it('returns zero count, null average and zero share when nothing matches', async () => {
            const stats = await repository.aggregateStats({ projectId: 'unknown-project' });
            expect(stats).toEqual({ callCount: 0, averageScore: null, problematicShare: 0 });
        });
    });
});
