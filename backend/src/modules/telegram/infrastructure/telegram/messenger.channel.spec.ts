import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../../shared/outbox/domain/delivery-errors';
import {
    ChannelDeliveryInProgressError,
    NotificationChannelPort,
} from '../../../notifications/domain/ports/notification-channel.port';
import { NotificationContent } from '../../../notifications/domain/notification-content';
import { Notification } from '../../../notifications/domain/notification';
import { NotificationTarget } from '../../../notifications/domain/notification-target';
import {
    BotApiRateLimitedError,
    BotApiRejectedError,
    TransientDeliveryError,
} from '../../application/errors';
import {
    FixedClock,
    InMemoryTelegramDeliveryLog,
    InMemoryTelegramLinkRepository,
    InMemoryUserDirectory,
    NOW,
    RecordingMessageMetrics,
    silentLogger,
} from '../../application/test-doubles';
import { TelegramIdentity } from '../../domain/telegram-identity';
import { TelegramLink } from '../../domain/telegram-link';
import { BotApiStub } from '../../testing/bot-api-stub';
import { testTelegramSettings } from '../../testing/telegram-settings.fixture';
import { BotApiClient } from './bot-api-client';
import type { PinoLogger } from 'nestjs-pino';
import { MessengerChannel } from './messenger.channel';

const BORIS_ID = '6f1c1d4e-2b1a-4c55-9a3e-0d1f2a3b4c5d';
const CHAT_ID = 777n;
const RESERVATION_MS = 120_000;

let notificationSequence = 0;

function notificationFor(
    recipientId: string,
    content: { title: string; body: string } = {
        title: 'Вам назначена задача',
        body: 'anna назначила вас ответственным: Подготовить КП',
    },
): Notification {
    notificationSequence += 1;
    const notification = Notification.create({
        id: `0b9a8c7d-6e5f-4a3b-8c2d-${String(notificationSequence).padStart(12, '0')}`,
        draft: {
            recipientId,
            type: 'task.assigned',
            content: NotificationContent.of(content),
            target: NotificationTarget.of({ type: 'task', id: 'task-1' }),
            actorId: 'anna',
        },
        sourceEventId: `event-${String(notificationSequence)}`,
        now: NOW,
    });
    notification.pullDomainEvents();
    return notification;
}

function sentOk(messageId: number): { status: number; body: unknown } {
    return { status: 200, body: { ok: true, result: { message_id: messageId } } };
}

function failure(
    status: number,
    description: string,
    retryAfter?: number,
): { status: number; body: unknown } {
    return {
        status,
        body: {
            ok: false,
            error_code: status,
            description,
            ...(retryAfter === undefined ? {} : { parameters: { retry_after: retryAfter } }),
        },
    };
}

describe('MessengerChannel', () => {
    let stub: BotApiStub;
    let clock: FixedClock;
    let deliveries: InMemoryTelegramDeliveryLog;
    let links: InMemoryTelegramLinkRepository;
    let users: InMemoryUserDirectory;
    let metrics: RecordingMessageMetrics;
    let channel: MessengerChannel;

    let logger: PinoLogger;

    function channelWith(
        apiBaseUrl: string,
        botToken?: string | null,
        requestTimeoutMs?: number,
    ): MessengerChannel {
        const settings = testTelegramSettings({
            apiBaseUrl,
            deliveryReservationMs: RESERVATION_MS,
            ...(botToken === null ? { botToken: undefined } : {}),
        });
        return new MessengerChannel(
            deliveries,
            links,
            users,
            new BotApiClient(
                settings,
                requestTimeoutMs === undefined ? undefined : { requestTimeoutMs },
            ),
            clock,
            settings,
            metrics,
            logger,
        );
    }

    function linkBoris(notificationsEnabled = true): void {
        const link = TelegramLink.link(
            BORIS_ID,
            TelegramIdentity.of({ telegramUserId: 9001n, chatId: CHAT_ID, username: 'boris_tg' }),
            NOW,
        );
        if (!notificationsEnabled) link.disableNotifications(NOW);
        links.linksByUserId.set(BORIS_ID, link);
    }

    beforeAll(async () => {
        stub = await BotApiStub.start();
    });

    beforeEach(() => {
        clock = new FixedClock();
        deliveries = new InMemoryTelegramDeliveryLog();
        links = new InMemoryTelegramLinkRepository();
        users = new InMemoryUserDirectory();
        users.add({ id: BORIS_ID, login: 'boris' });
        metrics = new RecordingMessageMetrics();
        logger = silentLogger();
        channel = channelWith(stub.baseUrl);
    });

    afterEach(() => {
        stub.reset();
    });

    afterAll(async () => {
        await stub.stop();
    });

    it('is the telegram notification channel', () => {
        expect(channel).toBeInstanceOf(NotificationChannelPort);
        expect(channel.channel).toBe('telegram');
    });

    describe('delivery', () => {
        it('sends the title and body to the linked chat and records the sent message', async () => {
            linkBoris();
            stub.respond('sendMessage', sentOk(501));
            const notification = notificationFor(BORIS_ID);

            await channel.deliver(notification);

            expect(stub.requestsOf('sendMessage').map(({ body }) => body)).toEqual([
                {
                    chat_id: '777',
                    text: '<b>Вам назначена задача</b>\nanna назначила вас ответственным: Подготовить КП',
                    parse_mode: 'HTML',
                },
            ]);
            expect(deliveries.rowsByNotificationId.get(notification.id)).toEqual({
                userId: BORIS_ID,
                status: 'sent',
                reservedAt: NOW,
                messageId: 501n,
                sentAt: NOW,
            });
            expect(metrics.sent).toEqual(['notification']);
        });

        it('escapes the user text so it does not change the markup', async () => {
            linkBoris();
            stub.respond('sendMessage', sentOk(502));

            await channel.deliver(
                notificationFor(BORIS_ID, { title: 'Задача <b> & Co', body: 'Тело <i>' }),
            );

            expect(stub.requestsOf('sendMessage')[0]?.body).toMatchObject({
                text: '<b>Задача &lt;b&gt; &amp; Co</b>\nТело &lt;i&gt;',
            });
        });

        it('does not send again after the delivery was recorded as sent', async () => {
            linkBoris();
            stub.respond('sendMessage', sentOk(503));
            const notification = notificationFor(BORIS_ID);

            await channel.deliver(notification);
            clock.current = new Date(NOW.getTime() + RESERVATION_MS * 10);
            await channel.deliver(notification);

            expect(stub.requestsOf('sendMessage')).toHaveLength(1);
        });
    });

    describe('skipped deliveries', () => {
        it('skips without sending when the bot token is not configured', async () => {
            linkBoris();
            const notification = notificationFor(BORIS_ID);

            await channelWith(stub.baseUrl, null).deliver(notification);

            expect(stub.requestsOf('sendMessage')).toHaveLength(0);
            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('skipped');
        });

        it.each([
            ['the recipient has no link', () => undefined],
            [
                'notifications are disabled',
                () => {
                    linkBoris(false);
                },
            ],
            [
                'the recipient is deactivated',
                () => {
                    linkBoris();
                    users.activeUsersById.delete(BORIS_ID);
                },
            ],
        ])('skips without sending when %s', async (_case, arrange) => {
            arrange();
            const notification = notificationFor(BORIS_ID);

            await channel.deliver(notification);

            expect(stub.requestsOf('sendMessage')).toHaveLength(0);
            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('skipped');
        });

        it('does not send a skipped notification after the recipient links Telegram', async () => {
            const notification = notificationFor(BORIS_ID);
            await channel.deliver(notification);

            linkBoris();
            stub.respond('sendMessage', sentOk(504));
            await channel.deliver(notification);

            expect(stub.requestsOf('sendMessage')).toHaveLength(0);
        });
    });

    describe('reservation held by another delivery', () => {
        it('retries later until the fresh reservation expires and sends one message', async () => {
            linkBoris();
            const notification = notificationFor(BORIS_ID);
            await deliveries.reserve({
                notificationId: notification.id,
                userId: BORIS_ID,
                now: NOW,
                reservationMs: RESERVATION_MS,
            });
            clock.current = new Date(NOW.getTime() + 30_000);

            const error: unknown = await channel.deliver(notification).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(ChannelDeliveryInProgressError);
            expect(error).toMatchObject({ retryAfterMs: RESERVATION_MS - 30_000 });
            expect(stub.requestsOf('sendMessage')).toHaveLength(0);

            stub.respond('sendMessage', sentOk(505));
            clock.current = new Date(NOW.getTime() + RESERVATION_MS + 1);
            await channel.deliver(notification);

            expect(stub.requestsOf('sendMessage')).toHaveLength(1);
            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('sent');
        });
    });

    describe('recording failure after a successful send', () => {
        it('keeps the reservation so a retry does not send the message again', async () => {
            linkBoris();
            stub.respond('sendMessage', sentOk(507));
            const notification = notificationFor(BORIS_ID);
            const databaseDown = new Error('connection terminated');
            vi.spyOn(deliveries, 'markSent').mockRejectedValueOnce(databaseDown);

            await expect(channel.deliver(notification)).rejects.toBe(databaseDown);

            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('sending');
            expect(metrics.sent).toEqual(['notification']);
            expect(metrics.errors).toEqual([]);

            clock.current = new Date(NOW.getTime() + 1_000);
            const retry: unknown = await channel.deliver(notification).catch((e: unknown) => e);

            expect(retry).toBeInstanceOf(ChannelDeliveryInProgressError);
            expect(stub.requestsOf('sendMessage')).toHaveLength(1);
        });
    });

    describe('send failures', () => {
        it.each([
            [
                'a 5xx response',
                () => {
                    stub.respond('sendMessage', failure(502, 'Bad Gateway'));
                },
            ],
            [
                'a response that outlives the request timeout',
                () => {
                    stub.respond('sendMessage', { ...sentOk(1), delayMs: 1_000 });
                },
            ],
        ])('keeps the reservation when the outcome of %s is unknown', async (_c, arrange) => {
            linkBoris();
            arrange();
            const impatient = channelWith(stub.baseUrl, undefined, 50);
            const notification = notificationFor(BORIS_ID);

            const error: unknown = await impatient.deliver(notification).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(RetryLaterDeliveryError);
            expect(error).not.toBeInstanceOf(ChannelDeliveryInProgressError);
            expect(error).toMatchObject({ retryAfterMs: RESERVATION_MS + 1 });
            expect(error).toHaveProperty('cause', expect.any(TransientDeliveryError));
            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('sending');
            expect(metrics.errors).toEqual(['transient']);
        });

        it('keeps the reservation on a network failure', async () => {
            linkBoris();
            const unreachable = channelWith('http://127.0.0.1:1');
            const notification = notificationFor(BORIS_ID);

            await expect(unreachable.deliver(notification)).rejects.toBeInstanceOf(
                RetryLaterDeliveryError,
            );

            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('sending');
        });

        it('does not send again before the reservation expires after an unknown outcome', async () => {
            linkBoris();
            const notification = notificationFor(BORIS_ID);
            stub.respond('sendMessage', failure(500, 'Internal Server Error'));
            await expect(channel.deliver(notification)).rejects.toThrow();

            stub.respond('sendMessage', sentOk(506));
            clock.current = new Date(NOW.getTime() + RESERVATION_MS - 1);
            const early: unknown = await channel.deliver(notification).catch((e: unknown) => e);

            expect(early).toBeInstanceOf(ChannelDeliveryInProgressError);
            expect(stub.requestsOf('sendMessage')).toHaveLength(1);

            clock.current = new Date(NOW.getTime() + RESERVATION_MS + 1);
            await channel.deliver(notification);
            await channel.deliver(notification);

            expect(stub.requestsOf('sendMessage')).toHaveLength(2);
            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('sent');
        });

        it('releases the reservation and retries by policy on 429 without retry_after', async () => {
            linkBoris();
            stub.respond('sendMessage', failure(429, 'Too Many Requests'));
            const notification = notificationFor(BORIS_ID);

            const error: unknown = await channel.deliver(notification).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BotApiRateLimitedError);
            expect(error).not.toBeInstanceOf(PermanentDeliveryError);
            expect(deliveries.rowsByNotificationId.has(notification.id)).toBe(false);
            expect(metrics.errors).toEqual(['rate_limited']);
        });

        it('asks to retry not earlier than retry_after on 429', async () => {
            linkBoris();
            stub.respond('sendMessage', failure(429, 'Too Many Requests: retry after 5', 5));
            const notification = notificationFor(BORIS_ID);

            const error: unknown = await channel.deliver(notification).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(RetryLaterDeliveryError);
            expect(error).toMatchObject({ retryAfterMs: 5000 });
            expect(deliveries.rowsByNotificationId.has(notification.id)).toBe(false);
            expect(metrics.errors).toEqual(['rate_limited']);
        });

        it('keeps the send error when releasing the reservation fails', async () => {
            const warnLog = vi.spyOn(logger, 'warn');
            linkBoris();
            stub.respond('sendMessage', failure(429, 'Too Many Requests: retry after 5', 5));
            vi.spyOn(deliveries, 'release').mockRejectedValueOnce(new Error('database down'));
            const notification = notificationFor(BORIS_ID);

            const error: unknown = await channel.deliver(notification).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(RetryLaterDeliveryError);
            expect(error).toMatchObject({ retryAfterMs: 5000 });
            expect(warnLog).toHaveBeenCalledTimes(1);
        });

        it('keeps the reservation and retries when removing the unavailable link fails', async () => {
            linkBoris();
            stub.respond('sendMessage', failure(403, 'Forbidden: bot was blocked by the user'));
            const databaseDown = new Error('database down');
            vi.spyOn(links, 'deleteByUserIdAndChatId').mockRejectedValueOnce(databaseDown);
            const notification = notificationFor(BORIS_ID);

            await expect(channel.deliver(notification)).rejects.toBe(databaseDown);

            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('sending');
            expect(links.linksByUserId.has(BORIS_ID)).toBe(true);
            expect(metrics.errors).toEqual(['chat_unavailable']);
        });

        it.each([
            [403, 'Forbidden: bot was blocked by the user'],
            [403, 'Forbidden: user is deactivated'],
            [403, 'Forbidden: bot was kicked from the group chat'],
            [400, 'Bad Request: chat not found'],
        ])('removes the link and completes the delivery on %i %s', async (status, description) => {
            linkBoris();
            stub.respond('sendMessage', failure(status, description));
            const notification = notificationFor(BORIS_ID);

            await expect(channel.deliver(notification)).resolves.toBeUndefined();

            expect(links.linksByUserId.has(BORIS_ID)).toBe(false);
            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('skipped');
            expect(metrics.errors).toEqual(['chat_unavailable']);

            await channel.deliver(notification);
            expect(stub.requestsOf('sendMessage')).toHaveLength(1);
        });

        it('keeps a link to another chat made while the send was failing', async () => {
            linkBoris();
            const relinked = TelegramLink.link(
                BORIS_ID,
                TelegramIdentity.of({ telegramUserId: 9002n, chatId: 888n, username: 'boris_new' }),
                NOW,
            );
            stub.respond('sendMessage', () => {
                links.linksByUserId.set(BORIS_ID, relinked);
                return failure(403, 'Forbidden: bot was blocked by the user');
            });
            const notification = notificationFor(BORIS_ID);

            await channel.deliver(notification);

            expect(links.linksByUserId.get(BORIS_ID)).toBe(relinked);
            expect(deliveries.rowsByNotificationId.get(notification.id)?.status).toBe('skipped');
        });

        it.each([
            [400, "Bad Request: can't parse entities"],
            [401, 'Unauthorized'],
        ])('fails permanently and keeps the link on %i %s', async (status, description) => {
            const errorLog = vi.spyOn(logger, 'error');
            linkBoris();
            stub.respond('sendMessage', failure(status, description));
            const notification = notificationFor(BORIS_ID);

            const error: unknown = await channel.deliver(notification).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(PermanentDeliveryError);
            expect(error).toHaveProperty('cause', expect.any(BotApiRejectedError));
            expect(links.linksByUserId.has(BORIS_ID)).toBe(true);
            expect(deliveries.rowsByNotificationId.has(notification.id)).toBe(false);
            expect(metrics.errors).toEqual(['permanent']);
            expect(errorLog).not.toHaveBeenCalled();
        });
    });
});
