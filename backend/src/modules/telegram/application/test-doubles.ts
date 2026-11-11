import { PinoLogger } from 'nestjs-pino';
import { ClockPort } from '../domain/ports/clock.port';
import { LinkTokenStorePort } from '../domain/ports/link-token-store.port';
import {
    TelegramDeliveryLogPort,
    type DeliveryReservation,
    type DeliveryReservationRequest,
    type SentDelivery,
} from '../domain/ports/telegram-delivery-log.port';
import {
    TelegramLinkRepositoryPort,
    type NotificationsSwitch,
} from '../domain/ports/telegram-link-repository.port';
import type { TelegramLink } from '../domain/telegram-link';
import { BotFilesPort, type BotFile } from './ports/bot-files.port';
import {
    BotMessengerPort,
    type BotChatAction,
    type SentBotMessage,
} from './ports/bot-messenger.port';
import {
    TelegramMessageMetricsPort,
    type TelegramMessageKind,
    type TelegramSendErrorReason,
} from './ports/telegram-message-metrics.port';
import { UpdateDeduplicatorPort } from './ports/update-deduplicator.port';
import { UserDirectoryPort, type DirectoryUser } from './ports/user-directory.port';

export const NOW = new Date('2026-03-01T12:00:00.000Z');

export class FixedClock extends ClockPort {
    current = NOW;

    now(): Date {
        return this.current;
    }
}

export interface StoredLinkToken {
    readonly userId: string;
    readonly ttlSeconds: number;
}

export class InMemoryLinkTokenStore extends LinkTokenStorePort {
    readonly tokensByDigest = new Map<string, StoredLinkToken>();

    save(digest: string, userId: string, ttlSeconds: number): Promise<void> {
        this.tokensByDigest.set(digest, { userId, ttlSeconds });
        return Promise.resolve();
    }

    consume(digest: string): Promise<string | null> {
        const stored = this.tokensByDigest.get(digest);
        this.tokensByDigest.delete(digest);
        return Promise.resolve(stored?.userId ?? null);
    }
}

export class InMemoryTelegramLinkRepository extends TelegramLinkRepositoryPort {
    readonly linksByUserId = new Map<string, TelegramLink>();

    findByUserId(userId: string): Promise<TelegramLink | null> {
        return Promise.resolve(this.linksByUserId.get(userId) ?? null);
    }

    findByTelegramUserId(telegramUserId: bigint): Promise<TelegramLink | null> {
        const found = [...this.linksByUserId.values()].find(
            (link) => link.telegramUserId === telegramUserId,
        );
        return Promise.resolve(found ?? null);
    }

    save(link: TelegramLink): Promise<void> {
        this.linksByUserId.set(link.userId, link);
        return Promise.resolve();
    }

    setNotificationsEnabled(change: NotificationsSwitch): Promise<TelegramLink | null> {
        const link = this.linksByUserId.get(change.userId);
        if (link === undefined) return Promise.resolve(null);
        if (change.telegramUserId !== undefined && link.telegramUserId !== change.telegramUserId) {
            return Promise.resolve(null);
        }
        if (change.isEnabled) link.enableNotifications(change.now);
        else link.disableNotifications(change.now);
        return Promise.resolve(link);
    }

    deleteByUserId(userId: string): Promise<TelegramLink | null> {
        const removed = this.linksByUserId.get(userId) ?? null;
        this.linksByUserId.delete(userId);
        return Promise.resolve(removed);
    }

    deleteByUserIdAndChatId(userId: string, chatId: bigint): Promise<TelegramLink | null> {
        const link = this.linksByUserId.get(userId);
        if (link?.chatId !== chatId) return Promise.resolve(null);
        this.linksByUserId.delete(userId);
        return Promise.resolve(link);
    }
}

export class InMemoryUserDirectory extends UserDirectoryPort {
    readonly activeUsersById = new Map<string, DirectoryUser>();

    add(user: DirectoryUser): void {
        this.activeUsersById.set(user.id, user);
    }

    findActiveById(userId: string): Promise<DirectoryUser | null> {
        return Promise.resolve(this.activeUsersById.get(userId) ?? null);
    }
}

export interface SentChatMessage {
    readonly chatId: bigint;
    readonly html: string;
}

export interface SentChatAction {
    readonly chatId: bigint;
    readonly action: BotChatAction;
}

export class RecordingBotMessenger extends BotMessengerPort {
    readonly sent: SentChatMessage[] = [];
    readonly chatActions: SentChatAction[] = [];
    chatActionFailure: Error | null = null;
    failure: Error | null = null;
    onSend: (message: SentChatMessage) => void = () => undefined;
    private nextMessageId = 1n;

    send(chatId: bigint, html: string): Promise<SentBotMessage> {
        const message = { chatId, html };
        this.onSend(message);
        if (this.failure !== null) return Promise.reject(this.failure);
        this.sent.push(message);
        const messageId = this.nextMessageId;
        this.nextMessageId += 1n;
        return Promise.resolve({ messageId });
    }

    sendChatAction(chatId: bigint, action: BotChatAction): Promise<void> {
        if (this.chatActionFailure !== null) return Promise.reject(this.chatActionFailure);
        this.chatActions.push({ chatId, action });
        return Promise.resolve();
    }

    textsTo(chatId: bigint): string[] {
        return this.sent.filter((message) => message.chatId === chatId).map(({ html }) => html);
    }
}

export class InMemoryUpdateDeduplicator extends UpdateDeduplicatorPort {
    readonly processedUpdateIds = new Set<number>();

    markProcessed(updateId: number): Promise<boolean> {
        if (this.processedUpdateIds.has(updateId)) return Promise.resolve(false);
        this.processedUpdateIds.add(updateId);
        return Promise.resolve(true);
    }
}

export function silentLogger(): PinoLogger {
    return new PinoLogger({ pinoHttp: { level: 'silent' } });
}

export interface DeliveryRow {
    readonly userId: string;
    readonly status: 'sending' | 'sent' | 'skipped';
    readonly reservedAt: Date;
    readonly messageId: bigint | null;
    readonly sentAt: Date | null;
}

export class InMemoryTelegramDeliveryLog extends TelegramDeliveryLogPort {
    readonly rowsByNotificationId = new Map<string, DeliveryRow>();

    reserve(request: DeliveryReservationRequest): Promise<DeliveryReservation> {
        const row = this.rowsByNotificationId.get(request.notificationId);
        const staleBefore = request.now.getTime() - request.reservationMs;
        if (
            row === undefined ||
            (row.status === 'sending' && row.reservedAt.getTime() < staleBefore)
        ) {
            this.rowsByNotificationId.set(request.notificationId, {
                userId: request.userId,
                status: 'sending',
                reservedAt: request.now,
                messageId: null,
                sentAt: null,
            });
            return Promise.resolve('reserved');
        }
        if (row.status !== 'sending') return Promise.resolve('done');
        return Promise.resolve({
            inProgressUntil: new Date(row.reservedAt.getTime() + request.reservationMs),
        });
    }

    markSent(delivery: SentDelivery): Promise<void> {
        const row = this.rowsByNotificationId.get(delivery.notificationId);
        if (row?.status === 'sending') {
            this.rowsByNotificationId.set(delivery.notificationId, {
                ...row,
                status: 'sent',
                messageId: delivery.messageId,
                sentAt: delivery.sentAt,
            });
        }
        return Promise.resolve();
    }

    markSkipped(notificationId: string): Promise<void> {
        const row = this.rowsByNotificationId.get(notificationId);
        if (row?.status === 'sending') {
            this.rowsByNotificationId.set(notificationId, { ...row, status: 'skipped' });
        }
        return Promise.resolve();
    }

    release(notificationId: string): Promise<void> {
        if (this.rowsByNotificationId.get(notificationId)?.status === 'sending') {
            this.rowsByNotificationId.delete(notificationId);
        }
        return Promise.resolve();
    }
}

export class RecordingMessageMetrics extends TelegramMessageMetricsPort {
    readonly sent: TelegramMessageKind[] = [];
    readonly errors: TelegramSendErrorReason[] = [];

    recordSent(kind: TelegramMessageKind): void {
        this.sent.push(kind);
    }

    recordSendError(reason: TelegramSendErrorReason): void {
        this.errors.push(reason);
    }
}

export interface StoredBotFile {
    readonly filePath: string;
    readonly fileSize: number | null;
    readonly content: Buffer;
}

/** Files double: serves the added files and records every request. */
export class InMemoryBotFiles extends BotFilesPort {
    readonly filesById = new Map<string, StoredBotFile>();
    readonly getFileCalls: string[] = [];
    readonly downloadCalls: string[] = [];
    getFileFailure: Error | null = null;
    downloadFailure: Error | null = null;

    add(fileId: string, file: StoredBotFile): void {
        this.filesById.set(fileId, file);
    }

    getFile(fileId: string): Promise<BotFile> {
        this.getFileCalls.push(fileId);
        if (this.getFileFailure !== null) return Promise.reject(this.getFileFailure);
        const file = this.filesById.get(fileId);
        if (file === undefined) return Promise.reject(new Error(`Unknown file ${fileId}`));
        return Promise.resolve({ filePath: file.filePath, fileSize: file.fileSize });
    }

    downloadFile(filePath: string): Promise<Buffer> {
        this.downloadCalls.push(filePath);
        if (this.downloadFailure !== null) return Promise.reject(this.downloadFailure);
        const file = [...this.filesById.values()].find((stored) => stored.filePath === filePath);
        if (file === undefined) return Promise.reject(new Error(`Unknown path ${filePath}`));
        return Promise.resolve(file.content);
    }
}
