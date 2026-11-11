import { inspect } from 'node:util';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryTransactionRunner } from '../../../database/postgres/testing/in-memory-transaction-runner';
import type { LinkedBotSender } from '../domain/bot-sender';
import { LinkToken } from '../domain/link-token';
import { TelegramIdentity } from '../domain/telegram-identity';
import { TelegramLink } from '../domain/telegram-link';
import { TEST_BOT_USERNAME, testTelegramSettings } from '../testing/telegram-settings.fixture';
import { BotReplies } from './bot-replies';
import { BotUpdateDispatcher } from './bot-update-dispatcher';
import { IdentityResolver } from './identity-resolver';
import { LinkAccountUseCase } from './link-account.use-case';
import { FreeTextHandlerPort } from './ports/free-text-handler.port';
import { SetTelegramNotificationsUseCase } from './set-telegram-notifications.use-case';
import {
    FixedClock,
    InMemoryLinkTokenStore,
    InMemoryTelegramLinkRepository,
    InMemoryUpdateDeduplicator,
    InMemoryUserDirectory,
    NOW,
    RecordingBotMessenger,
    silentLogger,
} from './test-doubles';
import { UnlinkAccountUseCase } from './unlink-account.use-case';

const IVANOV_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const PETROV_ID = '0b9a8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const IVANOV_TG = 1001;
const STRANGER_TG = 3003;
const TTL_SECONDS = 600;

interface MessageUpdateInput {
    readonly updateId: number;
    readonly text?: string;
    readonly fromId?: number;
    readonly chatType?: string;
    readonly hasSender?: boolean;
}

function messageUpdate(input: MessageUpdateInput): Record<string, unknown> {
    const fromId = input.fromId ?? IVANOV_TG;
    return {
        update_id: input.updateId,
        message: {
            message_id: 10,
            date: 1_767_000_000,
            chat: {
                id: input.chatType === 'group' ? -100500 : fromId,
                type: input.chatType ?? 'private',
            },
            ...(input.hasSender === false
                ? {}
                : {
                      from: {
                          id: fromId,
                          is_bot: false,
                          first_name: 'Ivan',
                          username: 'ivanov_tg',
                      },
                  }),
            ...(input.text === undefined ? {} : { text: input.text }),
        },
    };
}

class RecordingFreeTextHandler extends FreeTextHandlerPort {
    readonly calls: { sender: LinkedBotSender; text: string }[] = [];

    handle(sender: LinkedBotSender, text: string): Promise<string> {
        this.calls.push({ sender, text });
        return Promise.resolve('free text reply');
    }
}

describe('BotUpdateDispatcher', () => {
    let deduplicator: InMemoryUpdateDeduplicator;
    let links: InMemoryTelegramLinkRepository;
    let users: InMemoryUserDirectory;
    let tokens: InMemoryLinkTokenStore;
    let messenger: RecordingBotMessenger;
    let freeText: FreeTextHandlerPort;
    let logger: PinoLogger;
    let clock: FixedClock;
    let nextUpdateId: number;

    function dispatcher(): BotUpdateDispatcher {
        const transactions = new InMemoryTransactionRunner();
        return new BotUpdateDispatcher(
            deduplicator,
            new IdentityResolver(links, users),
            new LinkAccountUseCase(
                transactions,
                tokens,
                users,
                links,
                messenger,
                clock,
                silentLogger(),
            ),
            new UnlinkAccountUseCase(transactions, links, messenger, silentLogger()),
            new SetTelegramNotificationsUseCase(testTelegramSettings(), links, clock),
            freeText,
            messenger,
            testTelegramSettings(),
            logger,
        );
    }

    function send(text: string, fromId: number = IVANOV_TG): Promise<unknown> {
        nextUpdateId += 1;
        return dispatcher().dispatch(messageUpdate({ updateId: nextUpdateId, text, fromId }));
    }

    async function linkIvanov(): Promise<TelegramLink> {
        const link = TelegramLink.link(
            IVANOV_ID,
            TelegramIdentity.of({
                telegramUserId: BigInt(IVANOV_TG),
                chatId: BigInt(IVANOV_TG),
                username: 'ivanov_tg',
            }),
            NOW,
        );
        await links.save(link);
        return link;
    }

    async function issueToken(userId: string): Promise<string> {
        const token = LinkToken.generate(TTL_SECONDS, NOW);
        await tokens.save(token.digest(), userId, TTL_SECONDS);
        return token.value;
    }

    function repliesToIvanov(): string[] {
        return messenger.textsTo(BigInt(IVANOV_TG));
    }

    beforeEach(() => {
        deduplicator = new InMemoryUpdateDeduplicator();
        links = new InMemoryTelegramLinkRepository();
        users = new InMemoryUserDirectory();
        tokens = new InMemoryLinkTokenStore();
        messenger = new RecordingBotMessenger();
        freeText = new RecordingFreeTextHandler();
        logger = silentLogger();
        clock = new FixedClock();
        nextUpdateId = 100;
        users.add({ id: IVANOV_ID, login: 'ivanov' });
        users.add({ id: PETROV_ID, login: 'petrov' });
    });

    describe('deduplication and parsing', () => {
        it('skips an update with an already processed update_id', async () => {
            await linkIvanov();
            const update = messageUpdate({ updateId: 7, text: '/help' });

            await expect(dispatcher().dispatch(update)).resolves.toBe('handled');
            await expect(dispatcher().dispatch(update)).resolves.toBe('duplicate');

            expect(repliesToIvanov()).toEqual([BotReplies.help('ivanov')]);
        });

        it.each([
            ['a group chat', messageUpdate({ updateId: 1, text: '/start', chatType: 'group' })],
            [
                'a message without a sender',
                messageUpdate({ updateId: 2, text: '/start', hasSender: false }),
            ],
            ['a message without text', messageUpdate({ updateId: 3 })],
            ['an update without a message', { update_id: 4, edited_message: { text: '/start' } }],
        ])('ignores %s without answering', async (_case, update) => {
            await expect(dispatcher().dispatch(update)).resolves.toBe('ignored');
            expect(messenger.sent).toEqual([]);
        });

        it.each([
            ['null', null],
            ['a string', 'update'],
            ['an update without update_id', { message: { text: '/start' } }],
            ['a negative update_id', { update_id: -1 }],
        ])('ignores %s without throwing', async (_case, update) => {
            await expect(dispatcher().dispatch(update)).resolves.toBe('ignored');
            expect(messenger.sent).toEqual([]);
            expect(deduplicator.processedUpdateIds.size).toBe(0);
        });
    });

    describe('anonymous sender', () => {
        it('links the account by /start with a token', async () => {
            const token = await issueToken(IVANOV_ID);

            await expect(send(`/start ${token}`)).resolves.toBe('handled');

            expect((await links.findByUserId(IVANOV_ID))?.telegramUserId).toBe(BigInt(IVANOV_TG));
            expect(repliesToIvanov()).toEqual([BotReplies.linked('ivanov')]);
        });

        it('links by /start addressed to the bot by name', async () => {
            const token = await issueToken(IVANOV_ID);

            await send(`/start@${TEST_BOT_USERNAME} ${token}`);

            expect(await links.findByUserId(IVANOV_ID)).not.toBeNull();
        });

        it('answers an invalid token without linking', async () => {
            await send(`/start ${LinkToken.generate(TTL_SECONDS, NOW).value}`);

            expect(links.linksByUserId.size).toBe(0);
            expect(repliesToIvanov()).toEqual([BotReplies.invalidLinkToken()]);
        });

        it('answers that the Telegram account belongs to another user', async () => {
            await links.save(
                TelegramLink.link(
                    PETROV_ID,
                    TelegramIdentity.of({
                        telegramUserId: BigInt(STRANGER_TG),
                        chatId: BigInt(STRANGER_TG),
                        username: null,
                    }),
                    NOW,
                ),
            );
            users.activeUsersById.delete(PETROV_ID);
            const token = await issueToken(IVANOV_ID);

            await send(`/start ${token}`, STRANGER_TG);

            expect(await links.findByUserId(IVANOV_ID)).toBeNull();
            expect(messenger.textsTo(BigInt(STRANGER_TG))).toEqual([BotReplies.accountTaken()]);
        });

        it.each(['/start', '/help', '/unlink', '/mute', '/unmute', 'Привет', '/unknown'])(
            'answers "%s" with the linking instruction',
            async (text) => {
                await expect(send(text)).resolves.toBe('handled');

                expect(repliesToIvanov()).toEqual([BotReplies.notLinked()]);
            },
        );

        it('treats a disabled linked user as unlinked and keeps the link', async () => {
            await linkIvanov();
            users.activeUsersById.delete(IVANOV_ID);

            await send('/mute');

            expect(repliesToIvanov()).toEqual([BotReplies.notLinked()]);
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(true);
        });
    });

    describe('linked sender', () => {
        it.each(['/start', '/help', `/help@${TEST_BOT_USERNAME}`])(
            'answers "%s" with the help',
            async (text) => {
                await linkIvanov();

                await send(text);

                expect(repliesToIvanov()).toEqual([BotReplies.help('ivanov')]);
            },
        );

        it('unlinks by /unlink and answers once', async () => {
            await linkIvanov();

            await send('/unlink');

            expect(await links.findByUserId(IVANOV_ID)).toBeNull();
            expect(repliesToIvanov()).toEqual([BotReplies.unlinked()]);
        });

        it('mutes and unmutes the notifications', async () => {
            await linkIvanov();

            await send('/mute');
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(false);

            await send('/unmute');
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(true);

            expect(repliesToIvanov()).toEqual([
                BotReplies.notificationsDisabled(),
                BotReplies.notificationsEnabled(),
            ]);
        });

        it('relinks the same account by /start with a new token', async () => {
            const link = await linkIvanov();
            link.disableNotifications(NOW);
            const token = await issueToken(IVANOV_ID);

            await send(`/start ${token}`);

            expect(links.linksByUserId.size).toBe(1);
            expect((await links.findByUserId(IVANOV_ID))?.notificationsEnabled).toBe(false);
            expect(repliesToIvanov()).toEqual([BotReplies.linked('ivanov')]);
        });

        it('rejects /start with a token of another user for a linked Telegram account', async () => {
            await linkIvanov();
            const token = await issueToken(PETROV_ID);

            await send(`/start ${token}`);

            expect(await links.findByUserId(PETROV_ID)).toBeNull();
            expect((await links.findByUserId(IVANOV_ID))?.telegramUserId).toBe(BigInt(IVANOV_TG));
            expect(repliesToIvanov()).toEqual([BotReplies.accountTaken()]);
        });

        it.each(['Подготовь КП для клиента', '/unknown'])(
            'passes "%s" to the free text handler and answers with its reply',
            async (text) => {
                const link = await linkIvanov();
                const recording = new RecordingFreeTextHandler();
                freeText = recording;

                await send(text);

                expect(recording.calls).toEqual([
                    { sender: { kind: 'linked', userId: IVANOV_ID, login: 'ivanov', link }, text },
                ]);
                expect(repliesToIvanov()).toEqual(['free text reply']);
            },
        );
    });

    describe('failures', () => {
        it('logs a failed update with its update_id and does not rethrow', async () => {
            await linkIvanov();
            const errorLog = vi.spyOn(logger, 'error');
            messenger.failure = new Error('Telegram is down');
            const update = messageUpdate({ updateId: 42, text: 'секретный текст пользователя' });

            await expect(dispatcher().dispatch(update)).resolves.toBe('failed');

            expect(errorLog).toHaveBeenCalledTimes(1);
            expect(errorLog).toHaveBeenCalledWith(
                { err: messenger.failure, updateId: 42 },
                'Telegram update processing failed',
            );
            expect(inspect(errorLog.mock.calls, { depth: 5 })).not.toContain('секретный текст');
        });

        it('does not log the link token of a failed /start', async () => {
            const errorLog = vi.spyOn(logger, 'error');
            messenger.failure = new Error('Telegram is down');
            const token = await issueToken(IVANOV_ID);
            tokens.tokensByDigest.clear();

            await expect(send(`/start ${token}`)).resolves.toBe('failed');

            expect(inspect(errorLog.mock.calls, { depth: 5 })).not.toContain(token);
        });

        it('keeps processing the next updates after a failure', async () => {
            await linkIvanov();
            messenger.failure = new Error('Telegram is down');
            await send('/help');
            messenger.failure = null;

            await expect(send('/help')).resolves.toBe('handled');

            expect(repliesToIvanov()).toEqual([BotReplies.help('ivanov')]);
        });

        it('reports a deduplication failure as a failed update', async () => {
            const errorLog = vi.spyOn(logger, 'error');
            deduplicator.markProcessed = () => Promise.reject(new Error('Redis is down'));

            await expect(
                dispatcher().dispatch(messageUpdate({ updateId: 9, text: '/help' })),
            ).resolves.toBe('failed');
            expect(errorLog).toHaveBeenCalledWith(
                expect.objectContaining({ updateId: 9 }),
                'Telegram update processing failed',
            );
            expect(messenger.sent).toEqual([]);
        });
    });
});
