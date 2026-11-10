import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
    PermanentDeliveryError,
    RetryLaterDeliveryError,
} from '../../../../shared/outbox/domain/delivery-errors';
import type { Notification } from '../../../notifications/domain/notification';
import { NotificationChannelPort } from '../../../notifications/domain/ports/notification-channel.port';
import { escapeHtml } from '../../application/bot-replies';
import { ChatUnavailableError } from '../../application/errors';
import { TelegramMessageMetricsPort } from '../../application/ports/telegram-message-metrics.port';
import { TelegramSettingsPort } from '../../application/ports/telegram-settings.port';
import { UserDirectoryPort } from '../../application/ports/user-directory.port';
import { sendErrorReasonOf } from '../../application/send-error-reason';
import { ClockPort } from '../../domain/ports/clock.port';
import { TelegramDeliveryLogPort } from '../../domain/ports/telegram-delivery-log.port';
import { TelegramLinkRepositoryPort } from '../../domain/ports/telegram-link-repository.port';
import { BotApiClient } from './bot-api-client';

export const TELEGRAM_CHANNEL = 'telegram';

export function notificationMessage(notification: Notification): string {
    const title = `<b>${escapeHtml(notification.content.title)}</b>`;
    const body = notification.content.body;
    return body === '' ? title : `${title}\n${escapeHtml(body)}`;
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
            throw new RetryLaterDeliveryError(
                'Telegram delivery is in progress in another handler',
                Math.max(0, reservation.inProgressUntil.getTime() - now.getTime()),
                undefined,
                { notificationId },
            );
        }
        const chatId = await this.findDeliverableChat(userId);
        if (chatId === null) {
            await this.deliveries.markSkipped(notificationId);
            return;
        }
        try {
            const sent = await this.client.sendMessage(chatId, notificationMessage(notification));
            this.metrics.recordSent('notification');
            await this.deliveries.markSent({
                notificationId,
                messageId: sent.messageId,
                sentAt: this.clock.now(),
            });
        } catch (error: unknown) {
            await this.handleSendFailure(error, notificationId, userId);
        }
    }

    private async findDeliverableChat(userId: string): Promise<bigint | null> {
        const link = await this.links.findByUserId(userId);
        if (link?.notificationsEnabled !== true) return null;
        const user = await this.users.findActiveById(userId);
        return user === null ? null : link.chatId;
    }

    private async handleSendFailure(
        error: unknown,
        notificationId: string,
        userId: string,
    ): Promise<void> {
        this.metrics.recordSendError(sendErrorReasonOf(error));
        if (error instanceof ChatUnavailableError) {
            await this.links.deleteByUserId(userId);
            await this.deliveries.markSkipped(notificationId);
            this.logger.info(
                { userId, notificationId },
                'Telegram link removed because the chat is unavailable',
            );
            return;
        }
        await this.deliveries.release(notificationId);
        if (error instanceof PermanentDeliveryError) {
            this.logger.error(
                { err: error, userId, notificationId },
                'Telegram notification was rejected by Bot API',
            );
        }
        throw error;
    }
}
