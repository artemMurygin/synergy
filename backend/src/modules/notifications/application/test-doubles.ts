import { AsyncLocalStorage } from 'node:async_hooks';
import { PinoLogger } from 'nestjs-pino';
import type { CommonQueryMethods } from 'slonik';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort, type DomainEvent } from '../../../shared/ddd';
import { Notification } from '../domain/notification';
import { NotificationContent } from '../domain/notification-content';
import type { NotificationDraft } from '../domain/notification-draft';
import { NotificationTarget } from '../domain/notification-target';
import { NotificationClockPort } from '../domain/ports/notification-clock.port';
import {
    NotificationRepositoryPort,
    type MarkReadResult,
    type NotificationPage,
    type NotificationPageQuery,
} from '../domain/ports/notification-repository.port';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { UserRealtimeEmitterPort, type RealtimeEvent } from './ports/user-realtime-emitter.port';

export const NOW = new Date('2026-03-01T12:00:00.000Z');

export function silentLogger(): PinoLogger {
    return new PinoLogger({ pinoHttp: { level: 'silent' } });
}

export class FixedClock extends NotificationClockPort {
    current = NOW;

    now(): Date {
        return this.current;
    }
}

export class SnapshotTransactionRunner extends TransactionRunnerPort {
    private readonly storage = new AsyncLocalStorage<true>();

    commits = 0;

    rollbacks = 0;

    constructor(private readonly participants: readonly { snapshot(): () => void }[]) {
        super();
    }

    async run<T>(work: () => Promise<T>): Promise<T> {
        if (this.storage.getStore() !== undefined) return work();
        const restores = this.participants.map((participant) => participant.snapshot());
        try {
            const result = await this.storage.run(true, work);
            this.commits += 1;
            return result;
        } catch (error: unknown) {
            this.rollbacks += 1;
            for (const restore of restores) restore();
            throw error;
        }
    }

    executor(): CommonQueryMethods {
        throw new Error('SnapshotTransactionRunner has no database connection');
    }

    afterCommit(): void {
        throw new Error('afterCommit is not used by notification use-cases');
    }

    isInTransaction(): boolean {
        return this.storage.getStore() !== undefined;
    }
}

export class RecordingEventPublisher extends DomainEventPublisherPort {
    readonly published: DomainEvent[] = [];

    readonly publishedInTransaction: boolean[] = [];

    failure: Error | null = null;

    constructor(private readonly transactions: TransactionRunnerPort) {
        super();
    }

    publish(events: readonly DomainEvent[]): Promise<void> {
        this.publishedInTransaction.push(this.transactions.isInTransaction());
        if (this.failure !== null) return Promise.reject(this.failure);
        this.published.push(...events);
        return Promise.resolve();
    }
}

function duplicateKey(notification: Notification): string {
    return `${notification.sourceEventId}|${notification.recipientId}|${notification.type}`;
}

export class InMemoryNotificationRepository extends NotificationRepositoryPort {
    readonly byId = new Map<string, Notification>();

    snapshot(): () => void {
        const saved = new Map(this.byId);
        return () => {
            this.byId.clear();
            for (const [id, notification] of saved) this.byId.set(id, notification);
        };
    }

    insertIgnoringDuplicates(notifications: readonly Notification[]): Promise<Notification[]> {
        const keys = new Set([...this.byId.values()].map(duplicateKey));
        const inserted: Notification[] = [];
        for (const notification of notifications) {
            const key = duplicateKey(notification);
            if (keys.has(key) || this.byId.has(notification.id)) continue;
            keys.add(key);
            this.byId.set(notification.id, notification);
            inserted.push(notification);
        }
        return Promise.resolve(inserted);
    }

    findById(id: string): Promise<Notification | null> {
        return Promise.resolve(this.byId.get(id) ?? null);
    }

    findPage(recipientId: string, query: NotificationPageQuery): Promise<NotificationPage> {
        const matching = this.ownedBy(recipientId)
            .filter((notification) => !query.isUnreadOnly || !notification.isRead())
            .sort(
                (left, right) =>
                    right.createdAt.getTime() - left.createdAt.getTime() ||
                    right.id.localeCompare(left.id),
            );
        const offset = query.page * query.limit;
        return Promise.resolve({
            items: matching.slice(offset, offset + query.limit),
            total: matching.length,
        });
    }

    countUnread(recipientId: string): Promise<number> {
        return Promise.resolve(
            this.ownedBy(recipientId).filter((notification) => !notification.isRead()).length,
        );
    }

    markRead(id: string, recipientId: string, now: Date): Promise<MarkReadResult> {
        const notification = this.byId.get(id);
        if (notification?.recipientId !== recipientId) {
            return Promise.resolve('not-found');
        }
        return Promise.resolve(notification.markAsRead(now) ? 'marked' : 'already-read');
    }

    markAllRead(recipientId: string, now: Date): Promise<void> {
        for (const notification of this.ownedBy(recipientId)) notification.markAsRead(now);
        return Promise.resolve();
    }

    private ownedBy(recipientId: string): Notification[] {
        return [...this.byId.values()].filter(
            (notification) => notification.recipientId === recipientId,
        );
    }
}

export class FakeUserDirectory extends UserDirectoryPort {
    readonly loginById = new Map<string, string>();

    readonly requestedIds: string[] = [];

    failure: Error | null = null;

    findLoginById(userId: string): Promise<string | null> {
        this.requestedIds.push(userId);
        if (this.failure !== null) return Promise.reject(this.failure);
        return Promise.resolve(this.loginById.get(userId) ?? null);
    }
}

export class RecordingRealtimeEmitter extends UserRealtimeEmitterPort {
    readonly emitted: { userId: string; event: RealtimeEvent }[] = [];

    failure: Error | null = null;

    emitToUser(userId: string, event: RealtimeEvent): Promise<void> {
        if (this.failure !== null) return Promise.reject(this.failure);
        this.emitted.push({ userId, event });
        return Promise.resolve();
    }
}

let draftSequence = 0;

export function makeDraft(overrides: Partial<NotificationDraft> = {}): NotificationDraft {
    draftSequence += 1;
    return {
        recipientId: 'boris',
        type: 'task.assigned',
        content: NotificationContent.of({
            title: 'Вам назначена задача',
            body: `anna назначил вас ответственным: Задача ${String(draftSequence)}`,
        }),
        target: NotificationTarget.of({ type: 'task', id: `task-${String(draftSequence)}` }),
        actorId: 'anna',
        ...overrides,
    };
}

let notificationSequence = 0;

export function makeNotification(
    overrides: { recipientId?: string; createdAt?: Date; sourceEventId?: string } = {},
): Notification {
    notificationSequence += 1;
    const notification = Notification.create({
        id: `n-${String(notificationSequence).padStart(4, '0')}`,
        draft: makeDraft({ recipientId: overrides.recipientId ?? 'boris' }),
        sourceEventId: overrides.sourceEventId ?? `event-${String(notificationSequence)}`,
        now:
            overrides.createdAt ??
            new Date(NOW.getTime() - 60 * 60_000 + notificationSequence * 1000),
    });
    notification.pullDomainEvents();
    return notification;
}
