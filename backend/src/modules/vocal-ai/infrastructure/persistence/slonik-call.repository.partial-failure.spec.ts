import { PinoLogger } from 'nestjs-pino';
import type { CommonQueryMethods } from 'slonik';
import { describe, expect, it, vi } from 'vitest';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import { Call } from '../../domain/entities/call.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { CallRepository } from './slonik-call.repository';

/**
 * Fake `TransactionRunnerPort` that runs each `run()` call independently (no real transaction),
 * so a rejection inside one call's work does not affect the others: matches how Postgres commits
 * each `pool.transaction()` call separately.
 */
type QueryFn = (query: { sql?: string }) => Promise<unknown>;

class FakeTransactionRunner extends TransactionRunnerPort {
    readonly executorMock: { query: ReturnType<typeof vi.fn<QueryFn>> } = {
        query: vi.fn<QueryFn>().mockResolvedValue({}),
    };

    async run<T>(work: () => Promise<T>): Promise<T> {
        return work();
    }

    async savepoint<T>(work: () => Promise<T>): Promise<T> {
        return work();
    }

    executor(): CommonQueryMethods {
        // CallRepository only calls `query()` on the executor; stubbing the rest of
        // CommonQueryMethods would add no coverage, so the cast is scoped to this fake.
        return this.executorMock as unknown as CommonQueryMethods;
    }

    afterCommit(): void {
        throw new Error('not used by this fake');
    }

    isInTransaction(): boolean {
        return false;
    }
}

function buildCall(callId: number): Call {
    return Call.create({
        callId: new CallId(callId),
        projectId: 'project-1',
        manager: null,
        client: null,
        callType: null,
        callCreatedAt: null,
        callCompletedAt: null,
        scoredAt: null,
        rescoredAt: null,
        durationSeconds: null,
        totalScore: null,
        maxScore: null,
    });
}

describe('CallRepository.upsertMany: частичный сбой записи', () => {
    it('сохраняет остальные звонки и не бросает ошибку, когда один звонок падает на вставке', async () => {
        const transactions = new FakeTransactionRunner();
        const logger = new PinoLogger({ pinoHttp: { level: 'silent' } });
        const errorSpy = vi.spyOn(logger, 'error');
        const repository = new CallRepository(transactions, logger);

        const callIds = [1, 2, 3];
        let callIndex = -1;
        transactions.executorMock.query.mockImplementation((query: { sql?: string }) => {
            const sqlText: string = query.sql ?? '';
            if (sqlText.includes('INSERT INTO vocal_ai_calls')) {
                callIndex += 1;
                if (callIds[callIndex] === 2) {
                    throw new Error('constraint violation on call 2');
                }
            }
            return Promise.resolve({});
        });

        const failedCallIds = await repository.upsertMany(callIds.map(buildCall));

        expect(failedCallIds.map((callId) => callId.value)).toEqual([2]);
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
            expect.objectContaining({ callId: 2 }),
            expect.any(String),
        );
        // 3 calls attempted, call 2 fails right away: its children deletes/inserts are never reached.
        const insertCallsAttempted = transactions.executorMock.query.mock.calls.filter((call) =>
            (call[0].sql ?? '').includes('INSERT INTO vocal_ai_calls'),
        );
        expect(insertCallsAttempted).toHaveLength(3);
    });
});
