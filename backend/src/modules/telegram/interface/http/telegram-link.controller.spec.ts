import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetTelegramLinkStatusUseCase } from '../../application/get-telegram-link-status.use-case';
import { IssueLinkTokenUseCase } from '../../application/issue-link-token.use-case';
import { LinkTokenThrottler } from '../../application/link-token-throttler';
import { SetTelegramNotificationsUseCase } from '../../application/set-telegram-notifications.use-case';
import { UnlinkAccountUseCase } from '../../application/unlink-account.use-case';
import { LinkTokenRateLimitedError } from '../../application/errors';
import { TelegramNotConfiguredError, TelegramNotLinkedError } from '../../domain/errors';
import { LinkTokenThrottlerGuard } from './link-token-throttler.guard';
import { TelegramLinkController } from './telegram-link.controller';
import {
    startTelegramHttpFixture,
    type TelegramHttpFixture,
} from './testing/telegram-http-fixture';

const USER_ID = '0b9a7c2e-1d3f-4a5b-8c6d-7e8f90a1b2c3';
const LINKED_AT = new Date('2026-11-06T10:00:00.000Z');
const EXPIRES_AT = new Date('2026-11-06T10:10:00.000Z');
const LINK_URL = 'https://t.me/synergy_test_bot?start=abcdefghijklmnopqrstuvwxyz012345';

const getStatus = { execute: vi.fn() };
const issueToken = { execute: vi.fn() };
const setNotifications = { execute: vi.fn() };
const unlink = { execute: vi.fn() };
const throttler = { acquire: vi.fn() };

const linkedView = {
    isAvailable: true,
    isLinked: true,
    username: 'ivanov_tg',
    notificationsEnabled: true,
    linkedAt: LINKED_AT,
};

describe('TelegramLinkController', () => {
    let fixture: TelegramHttpFixture;

    beforeAll(async () => {
        fixture = await startTelegramHttpFixture({
            controllers: [TelegramLinkController],
            providers: [
                LinkTokenThrottlerGuard,
                { provide: GetTelegramLinkStatusUseCase, useValue: getStatus },
                { provide: IssueLinkTokenUseCase, useValue: issueToken },
                { provide: SetTelegramNotificationsUseCase, useValue: setNotifications },
                { provide: UnlinkAccountUseCase, useValue: unlink },
                { provide: LinkTokenThrottler, useValue: throttler },
            ],
        });
    });

    afterAll(async () => {
        await fixture.app.close();
    });

    beforeEach(() => {
        vi.resetAllMocks();
        getStatus.execute.mockResolvedValue(linkedView);
        issueToken.execute.mockResolvedValue({ url: LINK_URL, expiresAt: EXPIRES_AT });
        setNotifications.execute.mockResolvedValue({ ...linkedView, notificationsEnabled: false });
        unlink.execute.mockResolvedValue(undefined);
        throttler.acquire.mockResolvedValue(undefined);
    });

    describe('GET /telegram/link', () => {
        it('returns the link of the token user', async () => {
            const response = await fixture.call('GET', '/telegram/link', {
                headers: fixture.bearer(USER_ID),
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                isAvailable: true,
                isLinked: true,
                username: 'ivanov_tg',
                notificationsEnabled: true,
                linkedAt: LINKED_AT.toISOString(),
            });
            expect(getStatus.execute).toHaveBeenCalledWith({ userId: USER_ID });
        });

        it('returns only availability and isLinked when there is no link', async () => {
            getStatus.execute.mockResolvedValue({ isAvailable: false, isLinked: false });

            const response = await fixture.call('GET', '/telegram/link', {
                headers: fixture.bearer(USER_ID),
            });

            expect(await response.json()).toEqual({ isAvailable: false, isLinked: false });
        });
    });

    describe('POST /telegram/link-token', () => {
        it('answers 201 with the link and its expiry', async () => {
            const response = await fixture.call('POST', '/telegram/link-token', {
                headers: fixture.bearer(USER_ID),
            });

            expect(response.status).toBe(201);
            expect(await response.json()).toEqual({
                url: LINK_URL,
                expiresAt: EXPIRES_AT.toISOString(),
            });
            expect(throttler.acquire).toHaveBeenCalledWith(USER_ID);
            expect(issueToken.execute).toHaveBeenCalledWith({ userId: USER_ID });
        });

        it('answers 503 TELEGRAM_NOT_CONFIGURED when the bot is not configured', async () => {
            issueToken.execute.mockRejectedValue(new TelegramNotConfiguredError());

            const response = await fixture.call('POST', '/telegram/link-token', {
                headers: fixture.bearer(USER_ID),
            });

            expect(response.status).toBe(503);
            expect(await response.json()).toMatchObject({ code: 'TELEGRAM_NOT_CONFIGURED' });
        });

        it('answers 429 with Retry-After when the rate limit is exceeded', async () => {
            throttler.acquire.mockRejectedValue(new LinkTokenRateLimitedError(42));

            const response = await fixture.call('POST', '/telegram/link-token', {
                headers: fixture.bearer(USER_ID),
            });

            expect(response.status).toBe(429);
            expect(response.headers.get('retry-after')).toBe('42');
            expect(await response.json()).toMatchObject({
                code: 'RATE_LIMITED',
                retryAfterSeconds: 42,
            });
            expect(issueToken.execute).not.toHaveBeenCalled();
        });
    });

    describe('PATCH /telegram/link', () => {
        it('switches notifications and answers 200 with the status', async () => {
            const response = await fixture.call('PATCH', '/telegram/link', {
                headers: fixture.bearer(USER_ID),
                body: { notificationsEnabled: false },
            });

            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({
                isLinked: true,
                notificationsEnabled: false,
            });
            expect(setNotifications.execute).toHaveBeenCalledWith(USER_ID, false);
        });

        it('answers 404 TELEGRAM_NOT_LINKED without a link', async () => {
            setNotifications.execute.mockRejectedValue(new TelegramNotLinkedError());

            const response = await fixture.call('PATCH', '/telegram/link', {
                headers: fixture.bearer(USER_ID),
                body: { notificationsEnabled: true },
            });

            expect(response.status).toBe(404);
            expect(await response.json()).toMatchObject({ code: 'TELEGRAM_NOT_LINKED' });
        });

        it.each([
            ['an empty body', {}],
            ['a string flag', { notificationsEnabled: 'yes' }],
            ['an unknown field', { notificationsEnabled: true, chatId: 1 }],
        ])('answers 400 for %s', async (_case, body) => {
            const response = await fixture.call('PATCH', '/telegram/link', {
                headers: fixture.bearer(USER_ID),
                body,
            });

            expect(response.status).toBe(400);
            expect(setNotifications.execute).not.toHaveBeenCalled();
        });
    });

    describe('DELETE /telegram/link', () => {
        it('answers 204 and unlinks the token user', async () => {
            const response = await fixture.call('DELETE', '/telegram/link', {
                headers: fixture.bearer(USER_ID),
            });

            expect(response.status).toBe(204);
            expect(await response.text()).toBe('');
            expect(unlink.execute).toHaveBeenCalledWith(USER_ID);
        });
    });

    it.each([
        ['GET', '/telegram/link'],
        ['POST', '/telegram/link-token'],
        ['PATCH', '/telegram/link'],
        ['DELETE', '/telegram/link'],
    ])('answers 401 to %s %s without an access token', async (method, path) => {
        const response = await fixture.call(method, path, {
            ...(method === 'PATCH' ? { body: { notificationsEnabled: true } } : {}),
        });

        expect(response.status).toBe(401);
        expect(getStatus.execute).not.toHaveBeenCalled();
        expect(issueToken.execute).not.toHaveBeenCalled();
        expect(setNotifications.execute).not.toHaveBeenCalled();
        expect(unlink.execute).not.toHaveBeenCalled();
        expect(throttler.acquire).not.toHaveBeenCalled();
    });
});
