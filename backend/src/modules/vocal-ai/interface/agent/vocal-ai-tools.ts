import { tool } from 'langchain';
import { z } from 'zod';
import type { AgentRunContext } from '../../../../shared/agent-capability';
import { ArgumentInvalidError, BaseError } from '../../../../shared/errors';
import type {
    CallDetailView,
    GetCallDetailUseCase,
} from '../../application/use-cases/get-call-detail.use-case';
import type { GetCallStatsUseCase } from '../../application/use-cases/get-call-stats.use-case';
import type { GetCallTranscriptUseCase } from '../../application/use-cases/get-call-transcript.use-case';
import type { ListCallsUseCase } from '../../application/use-cases/list-calls.use-case';
import type { Call } from '../../domain/entities/call.entity';
import type { CallMetricScore } from '../../domain/entities/call-metric-score.entity';
import type { CallSummary } from '../../domain/entities/call-summary.entity';
import type { CallTag } from '../../domain/entities/call-tag.entity';
import type { CallTranscriptLine } from '../../domain/entities/call-transcript-line.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { VocalAiErrorCode } from '../../domain/errors';
import type { CallFilter } from '../../domain/ports/call-repository.port';

/**
 * Deps of the vocal-ai agent tools. There is no field for `VocalAiGatewayPort` here at all:
 * list_calls and get_call_stats can only reach the local store through these use cases.
 */
export interface VocalAiToolsDeps {
    readonly listCalls: ListCallsUseCase;
    readonly getCallDetail: GetCallDetailUseCase;
    readonly getCallTranscript: GetCallTranscriptUseCase;
    readonly getCallStats: GetCallStatsUseCase;
}

/** A value the tool shows to the model as an error: plain text, never a stack trace. */
class ToolInputError extends Error {}

function json(value: unknown): string {
    return JSON.stringify(value);
}

function parseIsoDate(raw: string | undefined, fieldLabel: string): Date | undefined {
    if (raw === undefined) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        throw new ToolInputError(
            `Некорректная дата «${raw}» в поле ${fieldLabel}: нужна дата и время в формате ISO 8601, например 2026-02-01T09:00:00Z`,
        );
    }
    return date;
}

/** Turns a domain failure into text the model can relay; unknown failures are not swallowed. */
function explain(error: unknown): string {
    if (error instanceof ToolInputError) return error.message;
    if (error instanceof BaseError) {
        switch (error.code) {
            case VocalAiErrorCode.CallNotFound:
                return 'Звонок не найден в локальном хранилище';
            case VocalAiErrorCode.RequestFailed:
            case VocalAiErrorCode.AuthenticationFailed:
                return 'Не удалось загрузить транскрипцию из VocalAI, попробуйте ещё раз позже';
            default:
                if (error instanceof ArgumentInvalidError) {
                    return `Некорректное значение: ${error.message}`;
                }
        }
    }
    throw error;
}

const callFilterSchema = z.object({
    projectId: z.string().optional().describe('Идентификатор проекта VocalAI'),
    manager: z.string().optional().describe('Имя менеджера (оператора)'),
    callDateFrom: z
        .string()
        .optional()
        .describe('Начало диапазона дат звонка, ISO 8601, например 2026-01-01T00:00:00Z'),
    callDateTo: z
        .string()
        .optional()
        .describe('Конец диапазона дат звонка, ISO 8601, например 2026-02-01T00:00:00Z'),
    totalScoreMin: z.number().optional().describe('Минимальная общая оценка звонка'),
    totalScoreMax: z.number().optional().describe('Максимальная общая оценка звонка'),
    tagId: z.string().optional().describe('Идентификатор тега'),
    metricId: z.string().optional().describe('Идентификатор метрики чек-листа'),
    limit: z.number().int().positive().optional().describe('Максимальное число звонков в ответе'),
    offset: z.number().int().nonnegative().optional().describe('Смещение для постраничного вывода'),
});

type CallFilterArgs = z.infer<typeof callFilterSchema>;

function toFilter(input: CallFilterArgs): CallFilter {
    const callDateFrom = parseIsoDate(input.callDateFrom, 'callDateFrom');
    const callDateTo = parseIsoDate(input.callDateTo, 'callDateTo');
    return {
        ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
        ...(input.manager === undefined ? {} : { manager: input.manager }),
        ...(callDateFrom === undefined ? {} : { callDateFrom }),
        ...(callDateTo === undefined ? {} : { callDateTo }),
        ...(input.totalScoreMin === undefined ? {} : { totalScoreMin: input.totalScoreMin }),
        ...(input.totalScoreMax === undefined ? {} : { totalScoreMax: input.totalScoreMax }),
        ...(input.tagId === undefined ? {} : { tagId: input.tagId }),
        ...(input.metricId === undefined ? {} : { metricId: input.metricId }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.offset === undefined ? {} : { offset: input.offset }),
    };
}

function presentCall(call: Call): Record<string, unknown> {
    return {
        callId: call.callId.value,
        projectId: call.projectId,
        manager: call.manager,
        client: call.client,
        callType: call.callType,
        callCreatedAt: call.callCreatedAt?.toISOString() ?? null,
        callCompletedAt: call.callCompletedAt?.toISOString() ?? null,
        durationSeconds: call.durationSeconds,
        totalScore: call.totalScore,
        maxScore: call.maxScore,
    };
}

function presentMetricScore(score: CallMetricScore): Record<string, unknown> {
    return {
        metricId: score.metricId,
        metricTitle: score.metricTitle,
        scoreValue: score.scoreValue,
        maxScore: score.maxScore,
        reason: score.reason,
        recommendations: score.recommendations,
        isException: score.isException,
    };
}

function presentTag(tag: CallTag): Record<string, unknown> {
    return {
        tagId: tag.tagId,
        tagTitle: tag.tagTitle,
        value: tag.value,
        valueDescription: tag.valueDescription,
    };
}

function presentSummary(summary: CallSummary): Record<string, unknown> {
    return { summaryTitle: summary.summaryTitle, summaryText: summary.summaryText };
}

function presentCallDetail(detail: CallDetailView): Record<string, unknown> {
    return {
        callId: detail.callId.value,
        projectId: detail.projectId,
        manager: detail.manager,
        client: detail.client,
        callType: detail.callType,
        totalScore: detail.totalScore,
        maxScore: detail.maxScore,
        metricScores: detail.metricScores.map(presentMetricScore),
        tags: detail.tags.map(presentTag),
        summaries: detail.summaries.map(presentSummary),
    };
}

function presentTranscriptLine(line: CallTranscriptLine): Record<string, unknown> {
    return {
        speakerName: line.speakerName,
        speakerRole: line.speakerRole,
        startTimeSeconds: line.startTimeSeconds,
        endTimeSeconds: line.endTimeSeconds,
        text: line.text,
    };
}

/**
 * Tools of the vocal-ai agent: read calls and their analytics from the local sync store, with a
 * lazy fetch of the transcript as the only tool that can reach the external VocalAI API
 * (indirectly, through GetCallTranscriptUseCase). The run context is unused today because no
 * tool filters by the acting user; it is kept in the signature for parity with other capabilities.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- tool() generics are inferred per tool
export function createVocalAiTools(deps: VocalAiToolsDeps, _ctx: AgentRunContext) {
    const listCalls = tool(
        async (input) => {
            try {
                const filter = toFilter(input);
                const { calls, totalCount, truncated } = await deps.listCalls.execute(filter);
                if (calls.length === 0) {
                    return json({
                        total: totalCount,
                        truncated,
                        calls: [],
                        message: 'Звонков не найдено',
                    });
                }
                return json({ total: totalCount, truncated, calls: calls.map(presentCall) });
            } catch (error) {
                return json({ total: 0, truncated: false, calls: [], error: explain(error) });
            }
        },
        {
            name: 'list_calls',
            description:
                'Список звонков из локального хранилища с фильтрацией по проекту, менеджеру, диапазону дат звонка, диапазону общей оценки, тегу и метрике чек-листа, с пагинацией через limit/offset. Все фильтры опциональны и комбинируются через AND. Ответ содержит реальное общее количество подходящих звонков (total) и признак усечения результата лимитом (truncated). Внешний VocalAI API не вызывается.',
            schema: callFilterSchema,
        },
    );

    const getCall = tool(
        async (input) => {
            try {
                const callId = new CallId(input.callId);
                const detail = await deps.getCallDetail.execute(callId);
                return json({ found: true, call: presentCallDetail(detail) });
            } catch (error) {
                return json({ found: false, error: explain(error) });
            }
        },
        {
            name: 'get_call',
            description:
                'Детали звонка по идентификатору: метрики чек-листа, теги, AI-саммари и общая оценка, без текста транскрипции. Возвращает явную ошибку, если звонок не найден. Внешний VocalAI API не вызывается.',
            schema: z.object({
                callId: z.number().int().describe('Идентификатор звонка'),
            }),
        },
    );

    const getCallTranscript = tool(
        async (input) => {
            try {
                const callId = new CallId(input.callId);
                const lines = await deps.getCallTranscript.execute(callId);
                return json({ found: true, lines: lines.map(presentTranscriptLine) });
            } catch (error) {
                return json({ found: false, lines: [], error: explain(error) });
            }
        },
        {
            name: 'get_call_transcript',
            description:
                'Полный текст транскрипции звонка по его идентификатору. Если транскрипция ещё не сохранена локально, инструмент сам дожидается её ленивой загрузки перед возвратом результата.',
            schema: z.object({
                callId: z.number().int().describe('Идентификатор звонка'),
            }),
        },
    );

    const getCallStats = tool(
        async (input) => {
            try {
                const filter = toFilter(input);
                const stats = await deps.getCallStats.execute(filter);
                return json(stats);
            } catch (error) {
                return json({ error: explain(error) });
            }
        },
        {
            name: 'get_call_stats',
            description:
                'Агрегированная статистика по звонкам (количество звонков, средняя оценка, доля проблемных звонков), отфильтрованным по тем же критериям, что и list_calls. Считается по данным локального хранилища, внешний VocalAI API не вызывается.',
            schema: callFilterSchema,
        },
    );

    return { listCalls, getCall, getCallTranscript, getCallStats };
}

export type VocalAiTools = ReturnType<typeof createVocalAiTools>;
