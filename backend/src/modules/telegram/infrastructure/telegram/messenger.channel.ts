import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../../shared/outbox/domain/delivery-errors';
import type { Notification } from '../../../notifications/domain/notification';
import {
    ChannelDeliveryInProgressError,
    NotificationChannelPort,
} from '../../../notifications/domain/ports/notification-channel.port';
import { escapeHtml } from '../../application/bot-replies';
import type { SentBotMessage } from '../../application/ports/bot-messenger.port';
import {
    BotApiConflictError,
    BotApiRateLimitedError,
    BotApiRejectedError,
    ChatUnavailableError,
    TransientDeliveryError,
} from '../../application/errors';
import { TelegramMessageMetricsPort } from '../../application/ports/telegram-message-metrics.port';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { UserDirectoryPort } from '../../application/ports/user-directory.port';
import { sendErrorReasonOf } from '../../application/send-error-reason';
import { ClockPort } from '../../domain/ports/clock.port';
import { portalRequestUrl } from '../../domain/portal-request-url';
import { TelegramDeliveryLogPort } from '../../domain/ports/telegram-delivery-log.port';
import { TelegramLinkRepositoryPort } from '../../domain/ports/telegram-link-repository.port';
import { BotApiClient } from './bot-api-client';

export const TELEGRAM_CHANNEL = 'telegram';

const STALE_RESERVATION_OFFSET_MS = 1;

interface DeliveryAttempt {
    readonly notification: Notification;
    readonly chatId: bigint;
    readonly reservedAt: Date;
}

export function notificationMessage(notification: Notification, portalUrl: string | null): string {
    const title = `<b>${escapeHtml(notification.content.title)}</b>`;
    const body = notification.content.body;
    const text = body === '' ? title : `${title}\n${escapeHtml(body)}`;
    const target = notification.target;
    if (portalUrl === null || target.type !== 'request') return text;
    const href = escapeHtml(portalRequestUrl(portalUrl, target.id));
    return `${text}\n<a href="${href}">Открыть заявку</a>`;
}

@Injectable()
export class MessengerChannel extends NotificationChannelPort {
    readonly channel = TELEGRAM_CHANNEL;

    constructor(
        private readonly deliveries: TelegramDeliveryLogPort,
        private readonly links: TelegramLinkRepositoryPort,
        private readonly users: UserDirectoryPort,
        private readonly client: BotApiClient,
        private readonly clock: ClockPort,
        private readonly settings: TelegramSettingsPort,
        private readonly metrics: TelegramMessageMetricsPort,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(MessengerChannel.name);
    }

    async deliver(notification: Notification): Promise<void> {
        const notificationId = notification.id;
        const userId = notification.recipientId;
        const now = this.clock.now();
        const reservation = await this.deliveries.reserve({
            notificationId,
            userId,
            now,
            reservationMs: this.settings.deliveryReservationMs,
        });
        if (reservation === 'done') return;
        if (reservation !== 'reserved') {
            throw new ChannelDeliveryInProgressError(
                TELEGRAM_CHANNEL,
                Math.max(0, reservation.inProgressUntil.getTime() - now.getTime()),
                { notificationId },
            );
        }
        const chatId = await this.findDeliverableChat(userId);
        if (chatId === null) {
            await this.deliveries.markSkipped(notificationId);
            return;
        }
        const sent = await this.send({ notification, chatId, reservedAt: now });
        if (sent === null) return;
        this.metrics.recordSent('notification');
        await this.deliveries.markSent({
            notificationId,
            messageId: sent.messageId,
            sentAt: this.clock.now(),
        });
    }

    private async send(attempt: DeliveryAttempt): Promise<SentBotMessage | null> {
        try {
            return await this.client.sendMessage(
                attempt.chatId,
                notificationMessage(attempt.notification, this.settings.portalUrl),
            );
        } catch (error: unknown) {
            await this.handleSendFailure(error, attempt);
            return null;
        }
    }

    private async findDeliverableChat(userId: string): Promise<bigint | null> {
        if (this.settings.botToken === null) return null;
        const link = await this.links.findByUserId(userId);
        if (link?.notificationsEnabled !== true) return null;
        const user = await this.users.findActiveById(userId);
        return user === null ? null : link.chatId;
    }

    private async handleSendFailure(error: unknown, attempt: DeliveryAttempt): Promise<void> {
        const notificationId = attempt.notification.id;
        const userId = attempt.notification.recipientId;
        this.metrics.recordSendError(sendErrorReasonOf(error));
        if (error instanceof ChatUnavailableError) {
            await this.links.deleteByUserIdAndChatId(userId, attempt.chatId);
            await this.deliveries.markSkipped(notificationId);
            this.logger.info(
                { userId, notificationId },
                'Telegram link removed because the chat is unavailable',
            );
            return;
        }
        if (error instanceof TransientDeliveryError) {
            throw new RetryLaterDeliveryError(
                'Telegram send outcome is unknown, retry after the reservation expires',
                this.untilReservationExpires(attempt.reservedAt),
                error,
                { notificationId },
            );
        }
        await this.release(notificationId);
        throw toOutboxError(error);
    }

    private untilReservationExpires(reservedAt: Date): number {
        const expiresAt = reservedAt.getTime() + this.settings.deliveryReservationMs;
        return Math.max(0, expiresAt - this.clock.now().getTime()) + STALE_RESERVATION_OFFSET_MS;
    }

    private async release(notificationId: string): Promise<void> {
        try {
            await this.deliveries.release(notificationId);
        } catch (releaseError: unknown) {
            this.logger.warn(
                { err: releaseError, notificationId },
                'Telegram delivery reservation was not released',
            );
        }
    }
}

function toOutboxError(error: unknown): unknown {
    if (error instanceof BotApiRateLimitedError && error.retryAfterMs !== null) {
        return new RetryLaterDeliveryError(error.message, error.retryAfterMs, error);
    }
    if (error instanceof BotApiRejectedError || error instanceof BotApiConflictError) {
        return new PermanentDeliveryError(error.message, error);
    }
    return error;
}
