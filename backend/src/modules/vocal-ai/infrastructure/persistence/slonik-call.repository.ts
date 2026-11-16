import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { sql, type FragmentSqlToken } from 'slonik';
import { z } from 'zod';
import { TransactionRunnerPort } from '../../../../database/postgres/transaction-runner.port';
import {
    CallRepositoryPort,
    type CallFilter,
    type CallStats,
} from '../../domain/ports/call-repository.port';
import { Call } from '../../domain/entities/call.entity';
import { CallMetricScore } from '../../domain/entities/call-metric-score.entity';
import { CallSummary } from '../../domain/entities/call-summary.entity';
import { CallTag } from '../../domain/entities/call-tag.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';

const PROBLEMATIC_SCORE_RATIO_THRESHOLD = 0.5;
const DEFAULT_FIND_BY_FILTER_LIMIT = 200;
const MAX_FIND_BY_FILTER_LIMIT = 500;

const CALL_COLUMN_TYPES = [
    'int8',
    'text',
    'text',
    'text',
    'text',
    'timestamptz',
    'timestamptz',
    'timestamptz',
    'timestamptz',
    'int4',
    'float8',
    'float8',
] as const;

const METRIC_SCORE_COLUMN_TYPES = [
    'int8',
    'text',
    'text',
    'float8',
    'float8',
    'text',
    'text',
    'bool',
] as const;

const TAG_COLUMN_TYPES = ['int8', 'text', 'text', 'text', 'text'] as const;

const SUMMARY_COLUMN_TYPES = ['int8', 'text', 'text'] as const;

const callRow = z.object({
    call_id: z.bigint(),
    project_id: z.string(),
    manager: z.string().nullable(),
    client: z.string().nullable(),
    call_type: z.string().nullable(),
    call_created_at: z.number().nullable(),
    call_completed_at: z.number().nullable(),
    scored_at: z.number().nullable(),
    rescored_at: z.number().nullable(),
    duration_seconds: z.number().nullable(),
    total_score: z.number().nullable(),
    max_score: z.number().nullable(),
});

const metricScoreRow = z.object({
    call_id: z.bigint(),
    metric_id: z.string(),
    metric_title: z.string(),
    score_value: z.number(),
    max_score: z.number(),
    reason: z.string().nullable(),
    recommendations: z.string().nullable(),
    is_exception: z.boolean(),
});

const tagRow = z.object({
    call_id: z.bigint(),
    tag_id: z.string(),
    tag_title: z.string(),
    value: z.string(),
    value_description: z.string().nullable(),
});

const summaryRow = z.object({
    call_id: z.bigint(),
    summary_title: z.string(),
    summary_text: z.string(),
});

const statsRow = z.object({
    count: z.number(),
    average_score: z.number().nullable(),
    problematic_count: z.number(),
});

function toTimestamp(value: Date | null): string | null {
    return value === null ? null : value.toISOString();
}

function toNullableDate(value: number | null): Date | null {
    return value === null ? null : new Date(value);
}

function toCallRow(
    call: Call,
): [
    number,
    string,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
    string | null,
    number | null,
    number | null,
    number | null,
] {
    return [
        call.callId.value,
        call.projectId,
        call.manager,
        call.client,
        call.callType,
        toTimestamp(call.callCreatedAt),
        toTimestamp(call.callCompletedAt),
        toTimestamp(call.scoredAt),
        toTimestamp(call.rescoredAt),
        call.durationSeconds,
        call.totalScore,
        call.maxScore,
    ];
}

function toMetricScoreRow(
    score: CallMetricScore,
): [number, string, string, number, number, string | null, string | null, boolean] {
    return [
        score.callId,
        score.metricId,
        score.metricTitle,
        score.scoreValue,
        score.maxScore,
        score.reason,
        score.recommendations,
        score.isException,
    ];
}

function toTagRow(tag: CallTag): [number, string, string, string, string | null] {
    return [tag.callId, tag.tagId, tag.tagTitle, tag.value, tag.valueDescription];
}

function toSummaryRow(summary: CallSummary): [number, string, string] {
    return [summary.callId, summary.summaryTitle, summary.summaryText];
}

function toCall(
    row: ReturnType<typeof callRow.parse>,
    metricScores: readonly CallMetricScore[],
    tags: readonly CallTag[],
    summaries: readonly CallSummary[],
): Call {
    const call = Call.create({
        callId: new CallId(Number(row.call_id)),
        projectId: row.project_id,
        manager: row.manager,
        client: row.client,
        callType: row.call_type,
        callCreatedAt: toNullableDate(row.call_created_at),
        callCompletedAt: toNullableDate(row.call_completed_at),
        scoredAt: toNullableDate(row.scored_at),
        rescoredAt: toNullableDate(row.rescored_at),
        durationSeconds: row.duration_seconds,
        totalScore: row.total_score,
        maxScore: row.max_score,
    });
    call.replaceChildren(metricScores, tags, summaries);
    return call;
}

function toMetricScore(row: ReturnType<typeof metricScoreRow.parse>): CallMetricScore {
    return new CallMetricScore({
        callId: Number(row.call_id),
        metricId: row.metric_id,
        metricTitle: row.metric_title,
        scoreValue: row.score_value,
        maxScore: row.max_score,
        reason: row.reason,
        recommendations: row.recommendations,
        isException: row.is_exception,
    });
}

function toTag(row: ReturnType<typeof tagRow.parse>): CallTag {
    return new CallTag({
        callId: Number(row.call_id),
        tagId: row.tag_id,
        tagTitle: row.tag_title,
        value: row.value,
        valueDescription: row.value_description,
    });
}

function toSummary(row: ReturnType<typeof summaryRow.parse>): CallSummary {
    return new CallSummary({
        callId: Number(row.call_id),
        summaryTitle: row.summary_title,
        summaryText: row.summary_text,
    });
}

function buildWhere(filter: CallFilter): FragmentSqlToken {
    const conditions: FragmentSqlToken[] = [];

    if (filter.callId !== undefined) {
        conditions.push(sql.fragment`c.call_id = ${filter.callId.value}`);
    }
    if (filter.projectId !== undefined) {
        conditions.push(sql.fragment`c.project_id = ${filter.projectId}`);
    }
    if (filter.manager !== undefined) {
        conditions.push(sql.fragment`c.manager = ${filter.manager}`);
    }
    if (filter.callDateFrom !== undefined) {
        conditions.push(sql.fragment`c.call_created_at >= ${filter.callDateFrom.toISOString()}`);
    }
    if (filter.callDateTo !== undefined) {
        conditions.push(sql.fragment`c.call_created_at < ${filter.callDateTo.toISOString()}`);
    }
    if (filter.totalScoreMin !== undefined) {
        conditions.push(sql.fragment`c.total_score >= ${filter.totalScoreMin}`);
    }
    if (filter.totalScoreMax !== undefined) {
        conditions.push(sql.fragment`c.total_score <= ${filter.totalScoreMax}`);
    }
    if (filter.tagId !== undefined) {
        conditions.push(sql.fragment`EXISTS (
            SELECT 1 FROM vocal_ai_call_tags t
            WHERE t.call_id = c.call_id AND t.tag_id = ${filter.tagId}
        )`);
    }
    if (filter.metricId !== undefined) {
        conditions.push(sql.fragment`EXISTS (
            SELECT 1 FROM vocal_ai_call_metric_scores m
            WHERE m.call_id = c.call_id AND m.metric_id = ${filter.metricId}
        )`);
    }

    if (conditions.length === 0) return sql.fragment`TRUE`;
    return conditions.reduce((left, right) => sql.fragment`${left} AND ${right}`);
}

@Injectable()
export class CallRepository extends CallRepositoryPort {
    constructor(
        private readonly transactions: TransactionRunnerPort,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(CallRepository.name);
    }

    /**
     * Upserts each call in its own transaction: a failure on one call leaves the others, already
     * committed in this batch, saved. The failed call is logged and left for the next sync cycle.
     */
    async upsertMany(calls: Call[]): Promise<void> {
        if (calls.length === 0) return;

        for (const call of calls) {
            try {
                await this.upsertOne(call);
            } catch (error: unknown) {
                this.logger.error(
                    { err: error, callId: call.callId.value },
                    'Vocal AI call upsert failed, will retry on the next sync cycle',
                );
            }
        }
    }

    private async upsertOne(call: Call): Promise<void> {
        await this.transactions.run(async () => {
            const executor = this.transactions.executor();

            await executor.query(sql.unsafe`
                INSERT INTO vocal_ai_calls
                    (call_id, project_id, manager, client, call_type, call_created_at,
                     call_completed_at, scored_at, rescored_at, duration_seconds, total_score,
                     max_score, updated_at)
                SELECT c.call_id, c.project_id, c.manager, c.client, c.call_type,
                       c.call_created_at, c.call_completed_at, c.scored_at, c.rescored_at,
                       c.duration_seconds, c.total_score, c.max_score, now()
                FROM ${sql.unnest([toCallRow(call)], [...CALL_COLUMN_TYPES])} AS c (
                    call_id, project_id, manager, client, call_type, call_created_at,
                    call_completed_at, scored_at, rescored_at, duration_seconds, total_score,
                    max_score
                )
                ON CONFLICT (call_id) DO UPDATE SET
                    project_id = EXCLUDED.project_id,
                    manager = EXCLUDED.manager,
                    client = EXCLUDED.client,
                    call_type = EXCLUDED.call_type,
                    call_created_at = EXCLUDED.call_created_at,
                    call_completed_at = EXCLUDED.call_completed_at,
                    scored_at = EXCLUDED.scored_at,
                    rescored_at = EXCLUDED.rescored_at,
                    duration_seconds = EXCLUDED.duration_seconds,
                    total_score = EXCLUDED.total_score,
                    max_score = EXCLUDED.max_score,
                    updated_at = EXCLUDED.updated_at`);

            await executor.query(
                sql.unsafe`DELETE FROM vocal_ai_call_metric_scores WHERE call_id = ${call.callId.value}`,
            );
            await executor.query(
                sql.unsafe`DELETE FROM vocal_ai_call_tags WHERE call_id = ${call.callId.value}`,
            );
            await executor.query(
                sql.unsafe`DELETE FROM vocal_ai_call_summaries WHERE call_id = ${call.callId.value}`,
            );

            if (call.metricScores.length > 0) {
                await executor.query(sql.unsafe`
                    INSERT INTO vocal_ai_call_metric_scores
                        (call_id, metric_id, metric_title, score_value, max_score, reason,
                         recommendations, is_exception)
                    SELECT * FROM ${sql.unnest(call.metricScores.map(toMetricScoreRow), [
                        ...METRIC_SCORE_COLUMN_TYPES,
                    ])} AS m (call_id, metric_id, metric_title, score_value, max_score, reason,
                              recommendations, is_exception)`);
            }

            if (call.tags.length > 0) {
                await executor.query(sql.unsafe`
                    INSERT INTO vocal_ai_call_tags
                        (call_id, tag_id, tag_title, value, value_description)
                    SELECT * FROM ${sql.unnest(call.tags.map(toTagRow), [
                        ...TAG_COLUMN_TYPES,
                    ])} AS t (call_id, tag_id, tag_title, value, value_description)`);
            }

            if (call.summaries.length > 0) {
                await executor.query(sql.unsafe`
                    INSERT INTO vocal_ai_call_summaries (call_id, summary_title, summary_text)
                    SELECT * FROM ${sql.unnest(call.summaries.map(toSummaryRow), [
                        ...SUMMARY_COLUMN_TYPES,
                    ])} AS s (call_id, summary_title, summary_text)`);
            }
        });
    }

    async findByFilter(filter: CallFilter): Promise<Call[]> {
        const executor = this.transactions.executor();
        const where = buildWhere(filter);
        const limit = Math.min(
            filter.limit ?? DEFAULT_FIND_BY_FILTER_LIMIT,
            MAX_FIND_BY_FILTER_LIMIT,
        );
        const rows = await executor.any(sql.unsafe`
            SELECT c.call_id, c.project_id, c.manager, c.client, c.call_type, c.call_created_at,
                   c.call_completed_at, c.scored_at, c.rescored_at, c.duration_seconds,
                   c.total_score, c.max_score
            FROM vocal_ai_calls c
            WHERE ${where}
            ORDER BY c.call_id
            LIMIT ${limit}`);
        const parsedRows = rows.map((row) => callRow.parse(row));
        const callIds = parsedRows.map((row) => row.call_id);
        const [metricScoresByCall, tagsByCall, summariesByCall] = await Promise.all([
            this.loadMetricScores(callIds),
            this.loadTags(callIds),
            this.loadSummaries(callIds),
        ]);
        return parsedRows.map((row) =>
            toCall(
                row,
                metricScoresByCall.get(row.call_id) ?? [],
                tagsByCall.get(row.call_id) ?? [],
                summariesByCall.get(row.call_id) ?? [],
            ),
        );
    }

    async aggregateStats(filter: CallFilter): Promise<CallStats> {
        const executor = this.transactions.executor();
        const where = buildWhere(filter);
        const row = await executor.one(sql.unsafe`
            SELECT
                count(*)::int AS count,
                avg(c.total_score)::float8 AS average_score,
                count(*) FILTER (
                    WHERE c.total_score IS NOT NULL AND c.max_score IS NOT NULL
                        AND c.max_score > 0
                        AND (c.total_score / c.max_score) < ${PROBLEMATIC_SCORE_RATIO_THRESHOLD}
                )::int AS problematic_count
            FROM vocal_ai_calls c
            WHERE ${where}`);
        const parsed = statsRow.parse(row);
        return {
            callCount: parsed.count,
            averageScore: parsed.average_score,
            problematicShare: parsed.count === 0 ? 0 : parsed.problematic_count / parsed.count,
        };
    }

    private async loadMetricScores(callIds: bigint[]): Promise<Map<bigint, CallMetricScore[]>> {
        const result = new Map<bigint, CallMetricScore[]>();
        if (callIds.length === 0) return result;
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT call_id, metric_id, metric_title, score_value, max_score, reason,
                   recommendations, is_exception
            FROM vocal_ai_call_metric_scores
            WHERE call_id = ANY(${sql.array(
                callIds.map((id) => Number(id)),
                'int8',
            )})
            ORDER BY id`);
        for (const raw of rows) {
            const row = metricScoreRow.parse(raw);
            const list = result.get(row.call_id) ?? [];
            list.push(toMetricScore(row));
            result.set(row.call_id, list);
        }
        return result;
    }

    private async loadTags(callIds: bigint[]): Promise<Map<bigint, CallTag[]>> {
        const result = new Map<bigint, CallTag[]>();
        if (callIds.length === 0) return result;
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT call_id, tag_id, tag_title, value, value_description
            FROM vocal_ai_call_tags
            WHERE call_id = ANY(${sql.array(
                callIds.map((id) => Number(id)),
                'int8',
            )})
            ORDER BY id`);
        for (const raw of rows) {
            const row = tagRow.parse(raw);
            const list = result.get(row.call_id) ?? [];
            list.push(toTag(row));
            result.set(row.call_id, list);
        }
        return result;
    }

    private async loadSummaries(callIds: bigint[]): Promise<Map<bigint, CallSummary[]>> {
        const result = new Map<bigint, CallSummary[]>();
        if (callIds.length === 0) return result;
        const rows = await this.transactions.executor().any(sql.unsafe`
            SELECT call_id, summary_title, summary_text
            FROM vocal_ai_call_summaries
            WHERE call_id = ANY(${sql.array(
                callIds.map((id) => Number(id)),
                'int8',
            )})
            ORDER BY id`);
        for (const raw of rows) {
            const row = summaryRow.parse(raw);
            const list = result.get(row.call_id) ?? [];
            list.push(toSummary(row));
            result.set(row.call_id, list);
        }
        return result;
    }
}
