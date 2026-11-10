import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { TelegramNotConfiguredError } from '../domain/errors';
import { TEST_BOT_USERNAME, testTelegramSettings } from '../testing/telegram-settings.fixture';
import { IssueLinkTokenUseCase } from './issue-link-token.use-case';
import { FixedClock, InMemoryLinkTokenStore, NOW } from './test-doubles';

const USER_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const OTHER_USER_ID = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const TTL_SECONDS = 600;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32}$/;

function startParameterOf(url: string): string {
    const parameter = new URL(url).searchParams.get('start');
    if (parameter === null) throw new Error('Link has no start parameter');
    return parameter;
}

function sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

describe('IssueLinkTokenUseCase', () => {
    let store: InMemoryLinkTokenStore;
    let clock: FixedClock;
    let useCase: IssueLinkTokenUseCase;

    beforeEach(() => {
        store = new InMemoryLinkTokenStore();
        clock = new FixedClock();
        useCase = new IssueLinkTokenUseCase(
            testTelegramSettings({ linkTokenTtlSeconds: TTL_SECONDS }),
            store,
            clock,
        );
    });

    it('returns a deep link to the bot with the token in start', async () => {
        const issued = await useCase.execute({ userId: USER_ID });

        const url = new URL(issued.url);
        expect(`${url.origin}${url.pathname}`).toBe(`https://t.me/${TEST_BOT_USERNAME}`);
        expect([...url.searchParams.keys()]).toEqual(['start']);
        expect(startParameterOf(issued.url)).toMatch(TOKEN_FORMAT);
    });

    it('expires after the configured ttl', async () => {
        const issued = await useCase.execute({ userId: USER_ID });

        expect(issued.expiresAt).toEqual(new Date(NOW.getTime() + TTL_SECONDS * 1000));
    });

    it('stores only the sha256 of the token for the user with the ttl', async () => {
        const issued = await useCase.execute({ userId: USER_ID });
        const token = startParameterOf(issued.url);

        expect([...store.tokensByDigest.entries()]).toEqual([
            [sha256(token), { userId: USER_ID, ttlSeconds: TTL_SECONDS }],
        ]);
        expect(JSON.stringify([...store.tokensByDigest])).not.toContain(token);
    });

    it('keeps earlier links of the same user valid', async () => {
        const first = await useCase.execute({ userId: USER_ID });
        const second = await useCase.execute({ userId: USER_ID });

        expect(startParameterOf(first.url)).not.toBe(startParameterOf(second.url));
        await expect(store.consume(sha256(startParameterOf(first.url)))).resolves.toBe(USER_ID);
        await expect(store.consume(sha256(startParameterOf(second.url)))).resolves.toBe(USER_ID);
    });

    it('binds each link to the user who issued it', async () => {
        const mine = await useCase.execute({ userId: USER_ID });
        const theirs = await useCase.execute({ userId: OTHER_USER_ID });

        await expect(store.consume(sha256(startParameterOf(mine.url)))).resolves.toBe(USER_ID);
        await expect(store.consume(sha256(startParameterOf(theirs.url)))).resolves.toBe(
            OTHER_USER_ID,
        );
    });

    it.each([
        ['no bot token', { botToken: undefined }],
        ['no bot username', { botUsername: undefined }],
        ['updates mode off', { updatesMode: 'off' as const }],
    ])('refuses with %s and stores nothing', async (_case, overrides) => {
        const unconfigured = new IssueLinkTokenUseCase(
            testTelegramSettings(overrides),
            store,
            clock,
        );

        await expect(unconfigured.execute({ userId: USER_ID })).rejects.toBeInstanceOf(
            TelegramNotConfiguredError,
        );
        expect(store.tokensByDigest.size).toBe(0);
    });
});
