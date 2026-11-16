import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VocalAiAuthenticationError, VocalAiRequestError } from '../../domain/errors';
import { CallId } from '../../domain/value-objects/call-id.value-object';
import { SyncWindow } from '../../domain/value-objects/sync-window.value-object';
import type { VocalAiHttpRequest, VocalAiHttpResponse } from './vocal-ai-gateway.adapter';
import { VocalAiGateway } from './vocal-ai-gateway.adapter';

interface MockHttpClient {
    send: ReturnType<typeof vi.fn<(request: VocalAiHttpRequest) => Promise<VocalAiHttpResponse>>>;
}

const BASE_URL = 'https://vocal-ai.example.com';
const CREDENTIALS = { username: 'manager@synergy.ru', password: 'secret' };
const PROJECT_ID = '482';

function jsonResponse(status: number, body: unknown): VocalAiHttpResponse {
    return { status, body };
}

function ssoLoginResponse(accessToken = 'sso-access-token'): VocalAiHttpResponse {
    return jsonResponse(200, {
        access_token: accessToken,
        expires_in: 300,
        refresh_token: 'sso-refresh-token',
        refresh_expires_in: 1800,
        token_type: 'Bearer',
    });
}

function providerLoginResponse(
    accessToken = 'vocal-access-token',
    refreshToken = 'vocal-refresh-token',
): VocalAiHttpResponse {
    return jsonResponse(200, {
        userInfo: { id: 1, email: 'manager@synergy.ru' },
        accessToken,
        refreshToken,
    });
}

function callItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 777,
        manager: 'Иван Иванов',
        client: 'Клиент',
        callType: 'incoming',
        createdAt: '2026-11-01T10:00:00.000Z',
        completedAt: '2026-11-01T10:05:00.000Z',
        scoredAt: '2026-11-01T10:10:00.000Z',
        rescoredAt: null,
        durationSeconds: 300,
        totalScore: { score: 8, maxScore: 10, color: 'green' },
        metricScore: [
            {
                metricId: 42,
                scoreValue: 4,
                maxScore: 5,
                reason: 'Хорошо',
                recommendations: null,
                isException: false,
            },
        ],
        tags: [
            {
                id: 554,
                title: 'Грубит',
                values: [{ id: 1, value: 'нет', description: null }],
            },
        ],
        summaries: [{ id: 1, title: 'Саммари звонка', summary: 'Короткий текст' }],
        ...overrides,
    };
}

function createHttpClient(): MockHttpClient {
    return { send: vi.fn() };
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error: unknown) {
        return error;
    }
    throw new Error('Expected the promise to reject');
}

function createGateway(
    httpClient: MockHttpClient,
    overrides: Record<string, unknown> = {},
): VocalAiGateway {
    return new VocalAiGateway(httpClient, {
        baseUrl: BASE_URL,
        synergyLogin: CREDENTIALS.username,
        synergyPassword: CREDENTIALS.password,
        maxAttempts: 1,
        backoffMs: 1,
        ...overrides,
    });
}

describe('VocalAiGateway', () => {
    let httpClient: MockHttpClient;
    let gateway: VocalAiGateway;

    beforeEach(() => {
        httpClient = createHttpClient();
        gateway = createGateway(httpClient);
    });

    describe('login', () => {
        it('выполняет двухшаговый логин и сохраняет полученные токены', async () => {
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse('sso-token-1'))
                .mockResolvedValueOnce(providerLoginResponse('access-1', 'refresh-1'));

            const session = await gateway.login(CREDENTIALS);

            expect(session).toMatchObject({ accessToken: 'access-1', refreshToken: 'refresh-1' });
            expect(session.expiresAt).toBeInstanceOf(Date);
            expect(httpClient.send).toHaveBeenCalledTimes(2);
            expect(httpClient.send.mock.calls[0][0]).toMatchObject({
                method: 'POST',
                path: '/api/auth/proxy/synergy_login',
                body: { username: CREDENTIALS.username, password: CREDENTIALS.password },
            });
            expect(httpClient.send.mock.calls[1][0]).toMatchObject({
                method: 'POST',
                path: '/api/auth/provider/synergy',
                body: { code: 'sso-token-1' },
            });
        });

        it('пробрасывает ошибку с контекстом и не сохраняет токены при сбое SSO', async () => {
            gateway = createGateway(httpClient, { maxAttempts: 1 });
            httpClient.send.mockResolvedValueOnce(jsonResponse(401, { error: 'invalid_grant' }));

            const error = await rejectionOf(gateway.login(CREDENTIALS));
            expect(error).toBeInstanceOf(VocalAiAuthenticationError);
            if (!(error instanceof VocalAiAuthenticationError)) throw new Error('unreachable');
            expect(error.metadata).toMatchObject({ step: 'sso' });
            expect(httpClient.send).toHaveBeenCalledTimes(1);

            // Последующий логин должен снова выполнять оба шага, т.к. состояние не было сохранено.
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(providerLoginResponse());
            await expect(gateway.login(CREDENTIALS)).resolves.toMatchObject({
                accessToken: 'vocal-access-token',
            });
            expect(httpClient.send).toHaveBeenCalledTimes(3);
        });

        it('пробрасывает ошибку и не сохраняет токены при сбое обмена на токен VocalAI', async () => {
            gateway = createGateway(httpClient, { maxAttempts: 1 });
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(jsonResponse(500, { error: 'server_error' }));

            const error = await rejectionOf(gateway.login(CREDENTIALS));
            expect(error).toBeInstanceOf(VocalAiAuthenticationError);
            if (!(error instanceof VocalAiAuthenticationError)) throw new Error('unreachable');
            expect(error.metadata).toMatchObject({ step: 'provider' });
        });
    });

    describe('повторная авторизация на 401', () => {
        async function primeSession(): Promise<void> {
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(providerLoginResponse('initial-access', 'initial-refresh'));
            await gateway.login(CREDENTIALS);
            httpClient.send.mockClear();
        }

        it('на 401 выполняет refreshToken и повторяет исходный запрос один раз', async () => {
            await primeSession();

            httpClient.send
                .mockResolvedValueOnce(jsonResponse(401, { error: 'unauthorized' }))
                .mockResolvedValueOnce(
                    providerLoginResponse('refreshed-access', 'refreshed-refresh'),
                )
                .mockResolvedValueOnce(jsonResponse(200, { items: [callItem()] }));

            const window = new SyncWindow({
                fromAt: new Date('2026-11-01T00:00:00Z'),
                toAt: new Date('2026-11-16T00:00:00Z'),
            });
            const calls = await gateway.listCalls(PROJECT_ID, window);

            expect(calls).toHaveLength(1);
            expect(httpClient.send).toHaveBeenCalledTimes(3);
            expect(httpClient.send.mock.calls[0][0]).toMatchObject({
                accessToken: 'initial-access',
            });
            expect(httpClient.send.mock.calls[2][0]).toMatchObject({
                accessToken: 'refreshed-access',
            });
        });

        it('параллельные запросы, упавшие в 401 одновременно, используют один и тот же refresh', async () => {
            await primeSession();

            let refreshCalls = 0;
            httpClient.send.mockImplementation((request: { path: string }) => {
                if (request.path === '/api/call/1') {
                    const priorAttempts = httpClient.send.mock.calls.filter(
                        (call: unknown[]) => (call[0] as { path: string }).path === '/api/call/1',
                    ).length;
                    if (priorAttempts <= 2) return Promise.resolve(jsonResponse(401, {}));
                    return Promise.resolve(jsonResponse(200, { ...callItem(), id: 1 }));
                }
                if (request.path === '/api/auth/token/refresh') {
                    refreshCalls += 1;
                    return Promise.resolve(
                        jsonResponse(200, {
                            accessToken: 'shared-refresh-access',
                            refreshToken: 'shared-refresh-refresh',
                        }),
                    );
                }
                return Promise.resolve(jsonResponse(500, {}));
            });

            const [first, second] = await Promise.all([
                gateway.getCall(new CallId(1), PROJECT_ID),
                gateway.getCall(new CallId(1), PROJECT_ID),
            ]);

            expect(first.callId.value).toBe(1);
            expect(second.callId.value).toBe(1);
            expect(refreshCalls).toBe(1);
        });

        it('если refreshToken тоже упал — выполняет полный повторный логин через SSO', async () => {
            await primeSession();

            httpClient.send
                .mockResolvedValueOnce(jsonResponse(401, {}))
                .mockResolvedValueOnce(jsonResponse(500, { error: 'refresh_failed' }))
                .mockResolvedValueOnce(ssoLoginResponse('sso-after-refresh-fail'))
                .mockResolvedValueOnce(providerLoginResponse('relogin-access', 'relogin-refresh'))
                .mockResolvedValueOnce(jsonResponse(200, { ...callItem(), id: 1 }));

            const call = await gateway.getCall(new CallId(1), PROJECT_ID);

            expect(call.callId.value).toBe(1);
            expect(httpClient.send.mock.calls[4][0]).toMatchObject({
                accessToken: 'relogin-access',
            });
        });

        it('если и повторный логин не проходит — ошибка пробрасывается без побочных изменений', async () => {
            await primeSession();

            httpClient.send
                .mockResolvedValueOnce(jsonResponse(401, {}))
                .mockResolvedValueOnce(jsonResponse(500, { error: 'refresh_failed' }))
                .mockResolvedValueOnce(jsonResponse(401, { error: 'login_failed' }));

            const error = await rejectionOf(gateway.getCall(new CallId(1), PROJECT_ID));
            expect(error).toBeInstanceOf(VocalAiAuthenticationError);

            // Состояние не испорчено: следующий успешный обмен восстанавливает доступ без лишних шагов.
            httpClient.send.mockClear();
            httpClient.send
                .mockResolvedValueOnce(jsonResponse(401, {}))
                .mockResolvedValueOnce(jsonResponse(500, { error: 'refresh_failed' }))
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(
                    providerLoginResponse('recovered-access', 'recovered-refresh'),
                )
                .mockResolvedValueOnce(jsonResponse(200, { ...callItem(), id: 1 }));
            const recovered = await gateway.getCall(new CallId(1), PROJECT_ID);
            expect(recovered.callId.value).toBe(1);
        });
    });

    describe('listCalls', () => {
        it('отправляет POST с окном для callWindow и дублирующими полями для scoreWindow', async () => {
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(providerLoginResponse())
                .mockResolvedValueOnce(jsonResponse(200, { items: [callItem()] }));

            const fromAt = new Date('2026-11-01T00:00:00.000Z');
            const toAt = new Date('2026-11-16T00:00:00.000Z');
            const window = new SyncWindow({ fromAt, toAt });

            const calls = await gateway.listCalls(PROJECT_ID, window);

            expect(calls).toHaveLength(1);
            const [call] = calls;
            expect(call.callId).toEqual(new CallId(777));
            expect(call.projectId).toBe(PROJECT_ID);
            expect(call.totalScore).toBe(8);
            expect(call.maxScore).toBe(10);
            expect(call.metricScores).toHaveLength(1);
            expect(call.tags).toHaveLength(1);
            expect(call.summaries).toHaveLength(1);

            const listRequest = httpClient.send.mock.calls[2][0] as {
                method: string;
                path: string;
                body: Record<string, unknown>;
            };
            expect(listRequest.method).toBe('POST');
            expect(listRequest.path).toBe(`/api/calls/project/${PROJECT_ID}`);
            expect(listRequest.body).toMatchObject({
                startDate: fromAt.toISOString(),
                endDate: toAt.toISOString(),
                scoreStartDate: fromAt.toISOString(),
                scoreEndDate: toAt.toISOString(),
                dateFromScore: fromAt.toISOString(),
                dateToScore: toAt.toISOString(),
            });
        });
    });

    describe('getCall', () => {
        it('запрашивает карточку с project_id и возвращает детали с транскрипцией', async () => {
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(providerLoginResponse())
                .mockResolvedValueOnce(
                    jsonResponse(200, {
                        ...callItem(),
                        transcription: [
                            {
                                speakerName: 'Иван',
                                speakerRole: 'manager',
                                startTime: 0,
                                endTime: 5,
                                text: 'Добрый день',
                            },
                            {
                                speakerName: 'Клиент',
                                speakerRole: 'client',
                                startTime: 5,
                                endTime: 9,
                                text: 'Здравствуйте',
                            },
                        ],
                    }),
                );

            const detail = await gateway.getCall(new CallId(777), PROJECT_ID);

            expect(detail.callId).toEqual(new CallId(777));
            expect(detail.transcriptLines).toHaveLength(2);
            expect(detail.transcriptLines[0].speakerRole).toBe('manager');
            expect(detail.transcriptLines[1].text).toBe('Здравствуйте');

            const getRequest = httpClient.send.mock.calls[2][0] as {
                method: string;
                path: string;
                query?: Record<string, string>;
            };
            expect(getRequest.method).toBe('GET');
            expect(getRequest.path).toBe('/api/call/777');
            expect(getRequest.query).toEqual({ project_id: PROJECT_ID });
        });
    });

    describe('устойчивость к сбоям', () => {
        it('повторяет запрос при сетевой ошибке и возвращает результат при восстановлении', async () => {
            gateway = createGateway(httpClient, { maxAttempts: 3 });
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(providerLoginResponse())
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockResolvedValueOnce(jsonResponse(200, { items: [callItem()] }));

            const window = new SyncWindow({
                fromAt: new Date('2026-11-01T00:00:00Z'),
                toAt: new Date('2026-11-16T00:00:00Z'),
            });
            const calls = await gateway.listCalls(PROJECT_ID, window);

            expect(calls).toHaveLength(1);
            expect(httpClient.send).toHaveBeenCalledTimes(4);
        });

        it('пробрасывает ошибку наружу, когда ретраи исчерпаны при 5xx', async () => {
            gateway = createGateway(httpClient, { maxAttempts: 3 });
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(providerLoginResponse())
                .mockResolvedValueOnce(jsonResponse(502, { error: 'bad_gateway' }))
                .mockResolvedValueOnce(jsonResponse(503, { error: 'unavailable' }))
                .mockResolvedValueOnce(jsonResponse(500, { error: 'server_error' }));

            const window = new SyncWindow({
                fromAt: new Date('2026-11-01T00:00:00Z'),
                toAt: new Date('2026-11-16T00:00:00Z'),
            });

            const error = await rejectionOf(gateway.listCalls(PROJECT_ID, window));
            expect(error).toBeInstanceOf(VocalAiRequestError);
            expect(httpClient.send).toHaveBeenCalledTimes(5);
        });

        it('пробрасывает ошибку наружу, когда сетевые сбои повторяются постоянно', async () => {
            gateway = createGateway(httpClient, { maxAttempts: 3 });
            httpClient.send
                .mockResolvedValueOnce(ssoLoginResponse())
                .mockResolvedValueOnce(providerLoginResponse())
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockRejectedValueOnce(new Error('ECONNRESET'))
                .mockRejectedValueOnce(new Error('ECONNRESET'));

            const window = new SyncWindow({
                fromAt: new Date('2026-11-01T00:00:00Z'),
                toAt: new Date('2026-11-16T00:00:00Z'),
            });

            const error = await rejectionOf(gateway.listCalls(PROJECT_ID, window));
            expect(error).toBeInstanceOf(VocalAiRequestError);
        });
    });
});
