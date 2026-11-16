import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../database/postgres/migrator';
import { TransactionRunner } from '../../database/postgres/transaction-runner';
import { BackfillProjectCallsUseCase } from './application/use-cases/backfill-project-calls.use-case';
import { GetCallStatsUseCase } from './application/use-cases/get-call-stats.use-case';
import { GetCallTranscriptUseCase } from './application/use-cases/get-call-transcript.use-case';
import { ListCallsUseCase } from './application/use-cases/list-calls.use-case';
import { CallMetricScore } from './domain/entities/call-metric-score.entity';
import { CallSummary } from './domain/entities/call-summary.entity';
import { CallTag } from './domain/entities/call-tag.entity';
import { CallTranscriptLine } from './domain/entities/call-transcript-line.entity';
import type {
    VocalAiCallDetailDto,
    VocalAiCallSummaryDto,
    VocalAiLoginCredentials,
    VocalAiSession,
} from './domain/ports/vocal-ai-gateway.port';
import { VocalAiGatewayPort } from './domain/ports/vocal-ai-gateway.port';
import { CallId } from './domain/value-objects/call-id.value-object';
import type { SyncWindow } from './domain/value-objects/sync-window.value-object';
import { CallTranscriptRepository } from './infrastructure/persistence/slonik-call-transcript.repository';
import { CallRepository } from './infrastructure/persistence/slonik-call.repository';
import { SyncCursorRepository } from './infrastructure/persistence/slonik-sync-cursor.repository';

// Интеграционный тест: нужна PostgreSQL. Без PROGRAMS_ETL_TEST_ADMIN_URL тест пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

const BACKFILL_PAGE_WINDOW_MS = 200 * 365 * 24 * 60 * 60 * 1000;
const FIXTURE_CALL_ID = new CallId(9001);
const FIXTURE_PROJECT_ID = 'project-integration';

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function buildCallSummaryFixture(): VocalAiCallSummaryDto {
    return {
        callId: FIXTURE_CALL_ID,
        projectId: FIXTURE_PROJECT_ID,
        manager: 'Иванов',
        client: 'Клиент',
        callType: 'incoming',
        callCreatedAt: new Date('2026-01-10T10:00:00Z'),
        callCompletedAt: new Date('2026-01-10T10:05:00Z'),
        scoredAt: new Date('2026-01-10T10:10:00Z'),
        rescoredAt: null,
        durationSeconds: 300,
        totalScore: 8,
        maxScore: 10,
        metricScores: [
            new CallMetricScore({
                callId: FIXTURE_CALL_ID.value,
                metricId: 'greeting',
                metricTitle: 'Приветствие',
                scoreValue: 8,
                maxScore: 10,
                reason: null,
                recommendations: null,
                isException: false,
            }),
        ],
        tags: [
            new CallTag({
                callId: FIXTURE_CALL_ID.value,
                tagId: 'quality',
                tagTitle: 'Качество',
                value: 'ok',
                valueDescription: null,
            }),
        ],
        summaries: [
            new CallSummary({
                callId: FIXTURE_CALL_ID.value,
                summaryTitle: 'Итог',
                summaryText: 'Звонок прошёл хорошо',
            }),
        ],
    };
}

function buildTranscriptLinesFixture(): CallTranscriptLine[] {
    return [
        new CallTranscriptLine({
            callId: FIXTURE_CALL_ID.value,
            lineIndex: 0,
            speakerName: 'Иванов',
            speakerRole: 'manager',
            startTimeSeconds: 0,
            endTimeSeconds: 3,
            text: 'Добрый день!',
        }),
        new CallTranscriptLine({
            callId: FIXTURE_CALL_ID.value,
            lineIndex: 1,
            speakerName: 'Клиент',
            speakerRole: 'client',
            startTimeSeconds: 3,
            endTimeSeconds: 6,
            text: 'Здравствуйте',
        }),
    ];
}

/** Test double по образцу architecture.md: учитывает число вызовов getCall для проверки кэширования транскрипта. */
class FakeVocalAiGateway extends VocalAiGatewayPort {
    getCallCallCount = 0;

    login(_credentials: VocalAiLoginCredentials): Promise<VocalAiSession> {
        throw new Error('login must not be called in this scenario');
    }

    refreshToken(_session: VocalAiSession): Promise<VocalAiSession> {
        throw new Error('refreshToken must not be called in this scenario');
    }

    listCalls(_projectId: string, _window: SyncWindow): Promise<VocalAiCallSummaryDto[]> {
        return Promise.resolve([buildCallSummaryFixture()]);
    }

    getCall(callId: CallId, _projectId: string): Promise<VocalAiCallDetailDto> {
        this.getCallCallCount += 1;
        return Promise.resolve({
            ...buildCallSummaryFixture(),
            callId,
            transcriptLines: buildTranscriptLinesFixture(),
        });
    }
}

describe.skipIf(adminUrl === undefined)('vocal-ai module integration', () => {
    const dbName = `vocal_ai_integration_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let transactions: TransactionRunner;

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
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('backfills calls, exposes them through list/stats, and lazily caches the transcript', async () => {
        const callRepository = new CallRepository(transactions);
        const transcriptRepository = new CallTranscriptRepository(transactions);
        const cursorRepository = new SyncCursorRepository(transactions);
        const gateway = new FakeVocalAiGateway();

        const backfillProjectCalls = new BackfillProjectCallsUseCase(
            gateway,
            callRepository,
            cursorRepository,
            BACKFILL_PAGE_WINDOW_MS,
            new PinoLogger({ pinoHttp: { level: 'silent' } }),
        );
        const listCalls = new ListCallsUseCase(callRepository);
        const getCallStats = new GetCallStatsUseCase(callRepository);
        const getCallTranscript = new GetCallTranscriptUseCase(
            callRepository,
            transcriptRepository,
            gateway,
        );

        const backfillResult = await backfillProjectCalls.execute(FIXTURE_PROJECT_ID);
        expect(backfillResult.syncedCallsCount).toBe(1);

        const calls = await listCalls.execute({ projectId: FIXTURE_PROJECT_ID });
        expect(calls.map((call) => call.callId.value)).toEqual([FIXTURE_CALL_ID.value]);

        const stats = await getCallStats.execute({ projectId: FIXTURE_PROJECT_ID });
        expect(stats.callCount).toBe(1);

        const firstTranscript = await getCallTranscript.execute(
            FIXTURE_CALL_ID,
            FIXTURE_PROJECT_ID,
        );
        expect(firstTranscript.map((line) => line.text)).toEqual(['Добрый день!', 'Здравствуйте']);
        expect(gateway.getCallCallCount).toBe(1);

        const secondTranscript = await getCallTranscript.execute(
            FIXTURE_CALL_ID,
            FIXTURE_PROJECT_ID,
        );
        expect(secondTranscript.map((line) => line.text)).toEqual(['Добрый день!', 'Здравствуйте']);
        expect(gateway.getCallCallCount).toBe(1);
    });
});
