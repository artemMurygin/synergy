import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { VocalAiAuthenticationError, VocalAiRequestError } from '../../domain/errors';
import { CallMetricScore } from '../../domain/entities/call-metric-score.entity';
import { CallSummary } from '../../domain/entities/call-summary.entity';
import { CallTag } from '../../domain/entities/call-tag.entity';
import { CallTranscriptLine } from '../../domain/entities/call-transcript-line.entity';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import type { SyncWindow } from '../../domain/value-objects/sync-window.value-object';
import type {
    VocalAiCallDetailDto,
    VocalAiCallSummaryDto,
    VocalAiListCallsWindowKind,
    VocalAiLoginCredentials,
    VocalAiSession,
} from '../../domain/ports/vocal-ai-gateway.port';
import { VocalAiGatewayPort } from '../../domain/ports/vocal-ai-gateway.port';

const SSO_LOGIN_PATH = '/api/auth/proxy/synergy_login';
const PROVIDER_LOGIN_PATH = '/api/auth/provider/synergy';
const REFRESH_PATH = '/api/auth/token/refresh';
const callsListPath = (projectId: string): string => `/api/calls/project/${projectId}`;
const callDetailPath = (callId: number): string => `/api/call/${String(callId)}`;

const HTTP_UNAUTHORIZED = 401;
const HTTP_SERVER_ERROR_MIN = 500;
const HTTP_SUCCESS_MAX = 300;

/** Приблизительный TTL токена VocalAI (JWT HS256, по исследованию ≈ 1800 с), точный `expires_in` шаг 2 не возвращает. */
const APPROXIMATE_SESSION_TTL_MS = 1_800_000;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 500;

export interface VocalAiHttpRequest {
    method: 'GET' | 'POST';
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    accessToken?: string;
}

export interface VocalAiHttpResponse {
    status: number;
    body: unknown;
}

export interface VocalAiHttpClient {
    send(request: VocalAiHttpRequest): Promise<VocalAiHttpResponse>;
}

export interface VocalAiGatewaySettings {
    baseUrl: string;
    synergyLogin: string;
    synergyPassword: string;
    maxAttempts?: number;
    backoffMs?: number;
}

const ssoLoginResponseSchema = z.object({
    access_token: z.string().min(1),
});

const vocalAiSessionResponseSchema = z.union([
    z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }),
    z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1) }),
]);

const tagValueSchema = z.object({
    value: z.union([z.string(), z.number()]),
    description: z.string().nullable().optional(),
});

const tagSchema = z.object({
    id: z.union([z.string(), z.number()]),
    title: z.string(),
    values: z.array(tagValueSchema).optional(),
});

const summaryItemSchema = z.object({
    title: z.string(),
    summary: z.string(),
});

const metricScoreItemSchema = z.object({
    metricId: z.union([z.string(), z.number()]),
    scoreValue: z.number(),
    maxScore: z.number(),
    reason: z.string().nullable().optional(),
    recommendations: z.string().nullable().optional(),
    isException: z.boolean().optional(),
});

const totalScoreSchema = z
    .object({
        score: z.number().nullable(),
        maxScore: z.number().nullable(),
    })
    .nullable()
    .optional();

const callCardSchema = z.object({
    id: z.number().int().positive(),
    manager: z.string().nullable().optional(),
    client: z.string().nullable().optional(),
    callType: z.string().nullable().optional(),
    createdAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    scoredAt: z.string().nullable().optional(),
    rescoredAt: z.string().nullable().optional(),
    durationSeconds: z.number().nullable().optional(),
    totalScore: totalScoreSchema,
    metricScore: z.array(metricScoreItemSchema).optional(),
    tags: z.array(tagSchema).optional(),
    summaries: z.array(summaryItemSchema).optional(),
});

const listCallsResponseSchema = z.object({
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().positive().optional(),
    totalCalls: z.number().int().nonnegative().optional(),
    items: z.array(callCardSchema),
});

const LIST_CALLS_PAGE_LIMIT = 100;

const transcriptLineSchema = z.object({
    speakerName: z.string(),
    speakerRole: z.enum(['manager', 'client']),
    startTime: z.number(),
    endTime: z.number(),
    text: z.string(),
});

const callDetailSchema = callCardSchema.extend({
    transcription: z.array(transcriptLineSchema).optional(),
});

/**
 * Адаптер `VocalAiGatewayPort`: двухшаговый логин через SSO Синергии, авто-восстановление
 * сессии на 401 (single-flight) и ретраи с backoff при 5xx/сетевых сбоях внешнего API VocalAI.
 */
@Injectable()
export class VocalAiGateway extends VocalAiGatewayPort {
    private readonly maxAttempts: number;

    private readonly backoffMs: number;

    private session: VocalAiSession | null = null;

    private credentials: VocalAiLoginCredentials | null = null;

    private recoverInFlight: Promise<VocalAiSession> | null = null;

    constructor(
        private readonly httpClient: VocalAiHttpClient,
        private readonly settings: VocalAiGatewaySettings,
    ) {
        super();
        this.maxAttempts = settings.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        this.backoffMs = settings.backoffMs ?? DEFAULT_BACKOFF_MS;
    }

    async login(credentials: VocalAiLoginCredentials): Promise<VocalAiSession> {
        const ssoResponse = await this.sendWithRetry({
            method: 'POST',
            path: SSO_LOGIN_PATH,
            body: { username: credentials.username, password: credentials.password },
        });
        if (ssoResponse.status >= HTTP_SUCCESS_MAX) {
            throw new VocalAiAuthenticationError(
                `VocalAI SSO login failed with HTTP ${String(ssoResponse.status)}`,
                undefined,
                { step: 'sso', status: ssoResponse.status },
            );
        }
        const sso = ssoLoginResponseSchema.safeParse(ssoResponse.body);
        if (!sso.success) {
            throw new VocalAiAuthenticationError(
                'VocalAI SSO login returned an unexpected response',
                undefined,
                {
                    step: 'sso',
                },
            );
        }

        const providerResponse = await this.sendWithRetry({
            method: 'POST',
            path: PROVIDER_LOGIN_PATH,
            body: { code: sso.data.access_token },
        });
        if (providerResponse.status >= HTTP_SUCCESS_MAX) {
            throw new VocalAiAuthenticationError(
                `VocalAI token exchange failed with HTTP ${String(providerResponse.status)}`,
                undefined,
                { step: 'provider', status: providerResponse.status },
            );
        }
        const session = toSession(providerResponse.body, 'provider');

        this.session = session;
        this.credentials = credentials;
        return session;
    }

    async refreshToken(session: VocalAiSession): Promise<VocalAiSession> {
        const response = await this.sendWithRetry({
            method: 'POST',
            path: REFRESH_PATH,
            body: { refresh_token: session.refreshToken },
        });
        if (response.status >= HTTP_SUCCESS_MAX) {
            throw new VocalAiAuthenticationError(
                `VocalAI token refresh failed with HTTP ${String(response.status)}`,
                undefined,
                { step: 'refresh', status: response.status },
            );
        }
        const refreshed = toSession(response.body, 'refresh');
        this.session = refreshed;
        return refreshed;
    }

    async listCalls(
        projectId: string,
        window: SyncWindow,
        windowKind: VocalAiListCallsWindowKind,
    ): Promise<VocalAiCallSummaryDto[]> {
        const items: VocalAiCallSummaryDto[] = [];
        let offset = 0;
        for (;;) {
            const page = await this.fetchCallsPage(projectId, window, windowKind, offset);
            items.push(...page.items.map((item) => toCallSummaryDto(item, projectId)));
            const fetchedUpTo = offset + page.items.length;
            if (page.items.length < LIST_CALLS_PAGE_LIMIT) break;
            if (page.totalCalls !== undefined && fetchedUpTo >= page.totalCalls) break;
            offset = fetchedUpTo;
        }
        return items;
    }

    private async fetchCallsPage(
        projectId: string,
        window: SyncWindow,
        windowKind: VocalAiListCallsWindowKind,
        offset: number,
    ): Promise<{ items: CallCard[]; totalCalls: number | undefined }> {
        const fromAt = window.fromAt.toISOString();
        const toAt = window.toAt.toISOString();
        const isCallWindow = windowKind === 'callWindow';
        const response = await this.authorizedSend({
            method: 'POST',
            path: callsListPath(projectId),
            query: { limit: String(LIST_CALLS_PAGE_LIMIT), offset: String(offset) },
            body: {
                managers: [],
                clients: [],
                callTypes: [],
                marks: [],
                startDate: isCallWindow ? fromAt : null,
                endDate: isCallWindow ? toAt : null,
                scoreStartDate: isCallWindow ? null : fromAt,
                scoreEndDate: isCallWindow ? null : toAt,
                dateFromScore: isCallWindow ? null : fromAt,
                dateToScore: isCallWindow ? null : toAt,
                durationMin: null,
                durationMax: null,
                totalScoreMin: null,
                totalScoreMax: null,
                metricFilter: null,
                metricIds: [],
                tagFilter: null,
                tagIds: [],
                additionalFields: {},
                projectIds: [],
            },
        });
        if (response.status >= HTTP_SUCCESS_MAX) {
            throw new VocalAiRequestError(
                `VocalAI listCalls for project ${projectId} failed with HTTP ${String(response.status)}`,
                undefined,
                { projectId, status: response.status },
            );
        }
        const parsed = listCallsResponseSchema.safeParse(response.body);
        if (!parsed.success) {
            throw new VocalAiRequestError(
                'VocalAI listCalls returned an unexpected response',
                undefined,
                {
                    projectId,
                },
            );
        }
        return { items: parsed.data.items, totalCalls: parsed.data.totalCalls };
    }

    async getCall(callId: CallId, projectId: string): Promise<VocalAiCallDetailDto> {
        const response = await this.authorizedSend({
            method: 'GET',
            path: callDetailPath(callId.value),
            query: { project_id: projectId },
        });
        if (response.status >= HTTP_SUCCESS_MAX) {
            throw new VocalAiRequestError(
                `VocalAI getCall ${String(callId.value)} failed with HTTP ${String(response.status)}`,
                undefined,
                { callId: callId.value, projectId, status: response.status },
            );
        }
        const parsed = callDetailSchema.safeParse(response.body);
        if (!parsed.success) {
            throw new VocalAiRequestError(
                'VocalAI getCall returned an unexpected response',
                undefined,
                {
                    callId: callId.value,
                    projectId,
                },
            );
        }
        const summary = toCallSummaryDto(parsed.data, projectId);
        const transcriptLines = (parsed.data.transcription ?? []).map(
            (line, index) =>
                new CallTranscriptLine({
                    callId: summary.callId.value,
                    lineIndex: index,
                    speakerName: line.speakerName,
                    speakerRole: line.speakerRole,
                    startTimeSeconds: line.startTime,
                    endTimeSeconds: line.endTime,
                    text: line.text,
                }),
        );
        return { ...summary, transcriptLines };
    }

    private async authorizedSend(
        request: Omit<VocalAiHttpRequest, 'accessToken'>,
    ): Promise<VocalAiHttpResponse> {
        const session = await this.ensureSession();
        const response = await this.sendWithRetry({ ...request, accessToken: session.accessToken });
        if (response.status !== HTTP_UNAUTHORIZED) return response;

        const recovered = await this.recoverSessionSingleFlight();
        return this.sendWithRetry({ ...request, accessToken: recovered.accessToken });
    }

    private async ensureSession(): Promise<VocalAiSession> {
        if (this.session !== null) return this.session;
        return this.login({
            username: this.settings.synergyLogin,
            password: this.settings.synergyPassword,
        });
    }

    private recoverSessionSingleFlight(): Promise<VocalAiSession> {
        this.recoverInFlight ??= this.recoverSession().finally(() => {
            this.recoverInFlight = null;
        });
        return this.recoverInFlight;
    }

    private async recoverSession(): Promise<VocalAiSession> {
        const session = this.session;
        if (session !== null) {
            try {
                return await this.refreshToken(session);
            } catch (refreshError: unknown) {
                return await this.reLoginAfterFailedRefresh(refreshError);
            }
        }
        return this.reLoginAfterFailedRefresh(undefined);
    }

    private async reLoginAfterFailedRefresh(cause: unknown): Promise<VocalAiSession> {
        if (this.credentials === null) {
            throw new VocalAiAuthenticationError(
                'VocalAI session recovery failed: no credentials available for re-login',
                cause instanceof Error ? cause : undefined,
                { step: 'recover' },
            );
        }
        return this.login(this.credentials);
    }

    /**
     * Повторяет запрос при сетевой ошибке или 5xx, ограниченное число раз (backoff нарастающий).
     * Статусный ответ (включая 5xx) возвращается вызывающему методу после исчерпания попыток —
     * тот сам решает, каким доменным исключением его обернуть. Бросает только когда все попытки
     * завершились транспортной ошибкой (ответа вообще не было).
     */
    private async sendWithRetry(request: VocalAiHttpRequest): Promise<VocalAiHttpResponse> {
        for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
            const isLastAttempt = attempt === this.maxAttempts;
            try {
                const response = await this.httpClient.send(request);
                if (response.status < HTTP_SERVER_ERROR_MIN || isLastAttempt) return response;
            } catch (error: unknown) {
                if (isLastAttempt) {
                    throw new VocalAiRequestError(
                        `VocalAI request to ${request.path} failed after ${String(attempt)} attempt(s)`,
                        error instanceof Error ? error : undefined,
                        { path: request.path },
                    );
                }
            }
            await this.delay(this.backoffMs * attempt);
        }
        throw new VocalAiRequestError(`VocalAI request to ${request.path} failed`, undefined, {
            path: request.path,
        });
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

function toSession(body: unknown, step: 'provider' | 'refresh'): VocalAiSession {
    const parsed = vocalAiSessionResponseSchema.safeParse(body);
    if (!parsed.success) {
        throw new VocalAiAuthenticationError(
            `VocalAI ${step} step returned an unexpected response`,
            undefined,
            {
                step,
            },
        );
    }
    const accessToken =
        'accessToken' in parsed.data ? parsed.data.accessToken : parsed.data.access_token;
    const refreshToken =
        'refreshToken' in parsed.data ? parsed.data.refreshToken : parsed.data.refresh_token;
    return {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + APPROXIMATE_SESSION_TTL_MS),
    };
}

function toIsoDate(value: string | null | undefined): Date | null {
    if (value === null || value === undefined) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

type CallCard = z.infer<typeof callCardSchema>;

function toCallSummaryDto(card: CallCard, projectId: string): VocalAiCallSummaryDto {
    const callId = new CallId(card.id);

    const metricScores = (card.metricScore ?? []).map(
        (metric) =>
            new CallMetricScore({
                callId: callId.value,
                metricId: String(metric.metricId),
                // API VocalAI не возвращает metricTitle в списке/карточке звонка; требуется отдельный
                // запрос /api/metrics/list (вне scope текущего change) для сопоставления с названием.
                metricTitle: String(metric.metricId),
                scoreValue: metric.scoreValue,
                maxScore: metric.maxScore,
                reason: metric.reason ?? null,
                recommendations: metric.recommendations ?? null,
                isException: metric.isException ?? false,
            }),
    );

    const tags = (card.tags ?? []).flatMap((tag) =>
        (tag.values ?? []).map(
            (value) =>
                new CallTag({
                    callId: callId.value,
                    tagId: String(tag.id),
                    tagTitle: tag.title,
                    value: String(value.value),
                    valueDescription: value.description ?? null,
                }),
        ),
    );

    const summaries = (card.summaries ?? []).map(
        (summary) =>
            new CallSummary({
                callId: callId.value,
                summaryTitle: summary.title,
                summaryText: summary.summary,
            }),
    );

    return {
        callId,
        projectId,
        manager: card.manager ?? null,
        client: card.client ?? null,
        callType: card.callType ?? null,
        callCreatedAt: toIsoDate(card.createdAt),
        callCompletedAt: toIsoDate(card.completedAt),
        scoredAt: toIsoDate(card.scoredAt),
        rescoredAt: toIsoDate(card.rescoredAt),
        durationSeconds: card.durationSeconds ?? null,
        totalScore: card.totalScore?.score ?? null,
        maxScore: card.totalScore?.maxScore ?? null,
        metricScores,
        tags,
        summaries,
    };
}
