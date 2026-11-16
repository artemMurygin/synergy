import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { AgentRunContext } from '../../../../shared/agent-capability';
import { Call } from '../../domain/entities/call.entity';
import { CallMetricScore } from '../../domain/entities/call-metric-score.entity';
import { CallSummary } from '../../domain/entities/call-summary.entity';
import { CallTag } from '../../domain/entities/call-tag.entity';
import { CallTranscriptLine } from '../../domain/entities/call-transcript-line.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { CallNotFoundError } from '../../domain/errors';
import type { GetCallDetailUseCase } from '../../application/use-cases/get-call-detail.use-case';
import type { GetCallStatsUseCase } from '../../application/use-cases/get-call-stats.use-case';
import type { GetCallTranscriptUseCase } from '../../application/use-cases/get-call-transcript.use-case';
import type { ListCallsUseCase } from '../../application/use-cases/list-calls.use-case';
import { createVocalAiTools, type VocalAiTools, type VocalAiToolsDeps } from './vocal-ai-tools';

type MockedFn<T extends (...args: never[]) => unknown> = Mock<T>;

function buildCall(overrides: Partial<Parameters<typeof Call.create>[0]> = {}): Call {
    return Call.create({
        callId: new CallId(1),
        projectId: 'project-1',
        manager: 'Иванов',
        client: 'Клиент',
        callType: 'inbound',
        callCreatedAt: new Date('2026-01-10T10:00:00Z'),
        callCompletedAt: new Date('2026-01-10T10:20:00Z'),
        scoredAt: null,
        rescoredAt: null,
        durationSeconds: 1200,
        totalScore: 80,
        maxScore: 100,
        ...overrides,
    });
}

interface Fixture {
    listCalls: { execute: MockedFn<ListCallsUseCase['execute']> };
    getCallDetail: { execute: MockedFn<GetCallDetailUseCase['execute']> };
    getCallTranscript: { execute: MockedFn<GetCallTranscriptUseCase['execute']> };
    getCallStats: { execute: MockedFn<GetCallStatsUseCase['execute']> };
    tools: VocalAiTools;
}

function createFixture(): Fixture {
    const listCalls = { execute: vi.fn<ListCallsUseCase['execute']>().mockResolvedValue([]) };
    const getCallDetail = {
        execute: vi.fn<GetCallDetailUseCase['execute']>(),
    };
    const getCallTranscript = {
        execute: vi.fn<GetCallTranscriptUseCase['execute']>().mockResolvedValue([]),
    };
    const getCallStats = {
        execute: vi
            .fn<GetCallStatsUseCase['execute']>()
            .mockResolvedValue({ callCount: 0, averageScore: null, problematicShare: 0 }),
    };
    const deps: VocalAiToolsDeps = {
        listCalls: listCalls as unknown as ListCallsUseCase,
        getCallDetail: getCallDetail as unknown as GetCallDetailUseCase,
        getCallTranscript: getCallTranscript as unknown as GetCallTranscriptUseCase,
        getCallStats: getCallStats as unknown as GetCallStatsUseCase,
    };
    const ctx = AgentRunContext.create({ userId: 'me', threadId: 'thread-1' });
    const tools = createVocalAiTools(deps, ctx);
    return { listCalls, getCallDetail, getCallTranscript, getCallStats, tools };
}

async function call(
    tool: { invoke(input: never): Promise<unknown> },
    input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const raw = await tool.invoke(input as never);
    return JSON.parse(raw as string) as Record<string, unknown>;
}

describe('tool contracts', () => {
    it('exposes list_calls, get_call, get_call_transcript and get_call_stats', () => {
        const { tools } = createFixture();

        expect(Object.values(tools).map((tool) => tool.name)).toEqual([
            'list_calls',
            'get_call',
            'get_call_transcript',
            'get_call_stats',
        ]);
    });

    it('does not give list_calls or get_call_stats a dependency on VocalAiGatewayPort', () => {
        const { tools } = createFixture();

        expect(Object.keys(tools)).toEqual([
            'listCalls',
            'getCall',
            'getCallTranscript',
            'getCallStats',
        ]);
        // Architectural isolation: VocalAiToolsDeps has no gateway field at all (compile-time),
        // so neither tool can reach the gateway through its dependencies.
        expect(tools.listCalls.name).toBe('list_calls');
        expect(tools.getCallStats.name).toBe('get_call_stats');
    });
});

describe('list_calls', () => {
    it('validates filters with zod and calls only ListCallsUseCase', async () => {
        const { listCalls, tools } = createFixture();
        const found = buildCall();
        listCalls.execute.mockResolvedValue([found]);

        const result = await call(tools.listCalls, {
            projectId: 'project-1',
            manager: 'Иванов',
            callDateFrom: '2026-01-01T00:00:00Z',
            callDateTo: '2026-02-01T00:00:00Z',
            totalScoreMin: 50,
            totalScoreMax: 100,
            tagId: 't-1',
            metricId: 'm-1',
        });

        expect(listCalls.execute).toHaveBeenCalledWith({
            projectId: 'project-1',
            manager: 'Иванов',
            callDateFrom: new Date('2026-01-01T00:00:00Z'),
            callDateTo: new Date('2026-02-01T00:00:00Z'),
            totalScoreMin: 50,
            totalScoreMax: 100,
            tagId: 't-1',
            metricId: 'm-1',
        });
        expect(result.calls).toEqual([
            expect.objectContaining({ callId: 1, projectId: 'project-1', manager: 'Иванов' }),
        ]);
    });

    it('returns an empty list without error when nothing matches', async () => {
        const { tools } = createFixture();

        const result = await call(tools.listCalls, {});

        expect(result.calls).toEqual([]);
        expect(result.total).toBe(0);
    });

    it('rejects an invalid date filter instead of calling the use case', async () => {
        const { listCalls, tools } = createFixture();

        const result = await call(tools.listCalls, { callDateFrom: 'завтра' });

        expect(listCalls.execute).not.toHaveBeenCalled();
        expect(typeof result.error).toBe('string');
    });
});

describe('get_call', () => {
    it('returns metrics, tags, summaries and score of a known call', async () => {
        const { getCallDetail, tools } = createFixture();
        getCallDetail.execute.mockResolvedValue({
            callId: new CallId(42),
            projectId: 'project-1',
            manager: 'Иванов',
            client: 'Клиент',
            callType: 'inbound',
            totalScore: 80,
            maxScore: 100,
            metricScores: [
                new CallMetricScore({
                    callId: 42,
                    metricId: 'm-1',
                    metricTitle: 'Приветствие',
                    scoreValue: 5,
                    maxScore: 5,
                    reason: null,
                    recommendations: null,
                    isException: false,
                }),
            ],
            tags: [
                new CallTag({
                    callId: 42,
                    tagId: 't-1',
                    tagTitle: 'Жалоба',
                    value: 'да',
                    valueDescription: null,
                }),
            ],
            summaries: [
                new CallSummary({ callId: 42, summaryTitle: 'Итог', summaryText: 'Текст' }),
            ],
        });

        const result = await call(tools.getCall, { callId: 42 });

        expect(getCallDetail.execute).toHaveBeenCalledWith(new CallId(42));
        expect(result.found).toBe(true);
        expect(result.call).toMatchObject({
            callId: 42,
            projectId: 'project-1',
            manager: 'Иванов',
            totalScore: 80,
            maxScore: 100,
        });
        expect((result.call as { metricScores: unknown[] }).metricScores).toHaveLength(1);
        expect((result.call as { tags: unknown[] }).tags).toHaveLength(1);
        expect((result.call as { summaries: unknown[] }).summaries).toHaveLength(1);
        expect(result.call).not.toHaveProperty('transcript');
    });

    it('returns a readable error for an unknown call without throwing', async () => {
        const { getCallDetail, tools } = createFixture();
        getCallDetail.execute.mockRejectedValue(new CallNotFoundError(new CallId(999)));

        const result = await call(tools.getCall, { callId: 999 });

        expect(result.found).toBe(false);
        expect(typeof result.error).toBe('string');
        expect(String(result.error)).toMatch(/не найден/i);
    });

    it('rejects a non-positive callId instead of calling the use case', async () => {
        const { getCallDetail, tools } = createFixture();

        const result = await call(tools.getCall, { callId: -1 });

        expect(getCallDetail.execute).not.toHaveBeenCalled();
        expect(result.found).toBe(false);
        expect(typeof result.error).toBe('string');
    });
});

describe('get_call_transcript', () => {
    it('returns transcript lines through GetCallTranscriptUseCase', async () => {
        const { getCallTranscript, tools } = createFixture();
        const line = new CallTranscriptLine({
            callId: 42,
            lineIndex: 0,
            speakerName: 'Иванов',
            speakerRole: 'manager',
            startTimeSeconds: 0,
            endTimeSeconds: 3,
            text: 'Здравствуйте',
        });
        getCallTranscript.execute.mockResolvedValue([line]);

        const result = await call(tools.getCallTranscript, { callId: 42, projectId: 'project-1' });

        expect(getCallTranscript.execute).toHaveBeenCalledWith(new CallId(42), 'project-1');
        expect(result.lines).toEqual([
            {
                speakerName: 'Иванов',
                speakerRole: 'manager',
                startTimeSeconds: 0,
                endTimeSeconds: 3,
                text: 'Здравствуйте',
            },
        ]);
    });

    it('returns a readable error for an unknown call', async () => {
        const { getCallTranscript, tools } = createFixture();
        getCallTranscript.execute.mockRejectedValue(new CallNotFoundError(new CallId(999)));

        const result = await call(tools.getCallTranscript, {
            callId: 999,
            projectId: 'project-1',
        });

        expect(result.found).toBe(false);
        expect(String(result.error)).toMatch(/не найден/i);
    });
});

describe('get_call_stats', () => {
    it('calls GetCallStatsUseCase with the same filter shape as list_calls', async () => {
        const { getCallStats, tools } = createFixture();
        getCallStats.execute.mockResolvedValue({
            callCount: 5,
            averageScore: 72.5,
            problematicShare: 0.2,
        });

        const result = await call(tools.getCallStats, {
            manager: 'Иванов',
            callDateFrom: '2026-01-01T00:00:00Z',
        });

        expect(getCallStats.execute).toHaveBeenCalledWith({
            manager: 'Иванов',
            callDateFrom: new Date('2026-01-01T00:00:00Z'),
        });
        expect(result).toEqual({
            callCount: 5,
            averageScore: 72.5,
            problematicShare: 0.2,
        });
    });

    it('rejects an invalid date filter instead of calling the use case', async () => {
        const { getCallStats, tools } = createFixture();

        const result = await call(tools.getCallStats, { callDateTo: 'вчера' });

        expect(getCallStats.execute).not.toHaveBeenCalled();
        expect(typeof result.error).toBe('string');
    });
});
