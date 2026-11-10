import { AsyncResource } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { TransactionRunnerPort } from '../../../database/postgres/transaction-runner.port';
import { RequestContext } from '../../context/request-context';
import type { DomainEvent } from '../../ddd';
import { BaseError } from '../../errors';
import {
    DomainEventRegistry,
    InvalidEventPayloadError,
    type EventSubscriber,
    UnknownEventError,
} from '../application/domain-event-registry';
import { OutboxClockPort } from '../application/outbox-clock.port';
import { OutboxMetricsPort } from '../application/outbox-metrics.port';
import {
    OutboxStorePort,
    type ClaimedDelivery,
    type DeliveryLease,
} from '../application/outbox-store.port';
import { OutboxWakeUpPort } from '../application/outbox-wake-up.port';
import { PermanentDeliveryError, RetryLaterDeliveryError } from '../domain/delivery-errors';
import { RetryPolicy } from '../domain/retry-policy';
import { OutboxSettings } from './outbox-settings';

export const UNKNOWN_SUBSCRIBER = 'OUTBOX.UNKNOWN_SUBSCRIBER';

export const HANDLER_TIMED_OUT = 'OUTBOX.HANDLER_TIMED_OUT';
export const DELIVERY_LEASE_LOST = 'OUTBOX.DELIVERY_LEASE_LOST';

export class UnknownSubscriberError extends BaseError {
    readonly code: string = UNKNOWN_SUBSCRIBER;
}

export class HandlerTimedOutError extends BaseError {
    readonly code: string = HANDLER_TIMED_OUT;
}

export class DeliveryLeaseLostError extends BaseError {
    readonly code: string = DELIVERY_LEASE_LOST;
}

const WAKE_DEBOUNCE_MS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const MS_IN_SECOND = 1000;

const describeError = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

@Injectable()
export class OutboxRelay
    extends OutboxWakeUpPort
    implements OnApplicationBootstrap, OnModuleDestroy
{
    private readonly retryPolicy: RetryPolicy;

    private timer: NodeJS.Timeout | undefined;

    private runningCycle: Promise<void> | undefined;

    private isRunning = false;

    private isWakeRequested = false;

    private isWakeScheduled = false;

    private lastCleanupAt: number | undefined;

    private lastPendingGaugeAt: number | undefined;

    private readonly runCycleDetached: () => void;

    constructor(
        private readonly store: OutboxStorePort,
        private readonly registry: DomainEventRegistry,
        private readonly transactions: TransactionRunnerPort,
        private readonly settings: OutboxSettings,
        private readonly clock: OutboxClockPort,
        private readonly metrics: OutboxMetricsPort,
        private readonly logger: PinoLogger,
    ) {
        super();
        this.logger.setContext(OutboxRelay.name);
        this.retryPolicy = RetryPolicy.create({ maxAttempts: settings.maxAttempts });
        this.runCycleDetached = AsyncResource.bind(() => {
            this.timer = undefined;
            this.isWakeScheduled = false;
            this.runningCycle = this.runCycle();
        });
    }

    onApplicationBootstrap(): void {
        if (this.isRunning) return;
        this.isRunning = true;
        this.schedule(0);
    }

    async onModuleDestroy(): Promise<void> {
        this.isRunning = false;
        clearTimeout(this.timer);
        this.timer = undefined;
        this.isWakeScheduled = false;
        await this.runningCycle;
    }

    wake(): void {
        if (!this.isRunning) return;
        if (this.runningCycle !== undefined) {
            this.isWakeRequested = true;
            return;
        }
        if (this.isWakeScheduled) return;
        this.isWakeScheduled = true;
        this.schedule(WAKE_DEBOUNCE_MS);
    }

    async processBatch(): Promise<number> {
        const claimedAt = this.clock.now().getTime();
        const deliveries = await this.store.claimDueDeliveries(
            this.settings.batchSize,
            new Date(claimedAt),
            this.registry.registeredSubscriberNames(),
        );
        const leaseExpiresAt = claimedAt + this.settings.claimLeaseMs;
        for (const [index, delivery] of deliveries.entries()) {
            if (this.clock.now().getTime() + this.settings.handlerTimeoutMs >= leaseExpiresAt) {
                await this.release(deliveries.slice(index));
                break;
            }
            await this.deliver(delivery);
        }
        await this.refreshPendingGaugeIfDue();
        return deliveries.length;
    }

    async cleanup(): Promise<number> {
        const now = this.clock.now();
        this.lastCleanupAt = now.getTime();
        const retentionStart = new Date(now.getTime() - this.settings.retentionDays * DAY_MS);
        const deletedCount = await this.store.deleteProcessedBefore(retentionStart);
        if (deletedCount > 0) {
            this.logger.info({ deletedCount }, 'Outbox events cleaned up');
        }
        return deletedCount;
    }

    private async release(deliveries: readonly ClaimedDelivery[]): Promise<void> {
        await Promise.all(deliveries.map((delivery) => this.store.releaseClaim(delivery)));
        this.logger.warn(
            { releasedCount: deliveries.length },
            'Outbox lease is running out, the rest of the batch is released',
        );
    }

    private async refreshPendingGaugeIfDue(): Promise<void> {
        const now = this.clock.now().getTime();
        if (
            this.lastPendingGaugeAt !== undefined &&
            now - this.lastPendingGaugeAt < this.settings.pendingGaugeIntervalMs
        ) {
            return;
        }
        this.lastPendingGaugeAt = now;
        this.metrics.setPendingDeliveries(await this.store.countPendingBySubscriber());
    }

    private schedule(delayMs: number): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(this.runCycleDetached, delayMs);
    }

    private async runCycle(): Promise<void> {
        let hasMore = false;
        try {
            hasMore = (await this.processBatch()) >= this.settings.batchSize;
            await this.cleanupIfDue();
        } catch (error: unknown) {
            this.logger.error({ err: error }, 'Outbox cycle failed');
        }
        this.runningCycle = undefined;
        if (!this.isRunning) return;
        const shouldRunAgain = hasMore || this.isWakeRequested;
        this.isWakeRequested = false;
        this.schedule(shouldRunAgain ? 0 : this.settings.pollIntervalMs);
    }

    private async cleanupIfDue(): Promise<void> {
        const now = this.clock.now().getTime();
        if (
            this.lastCleanupAt !== undefined &&
            now - this.lastCleanupAt < this.settings.cleanupIntervalMs
        ) {
            return;
        }
        await this.cleanup();
    }

    private async deliver(delivery: ClaimedDelivery): Promise<void> {
        let event: DomainEvent;
        try {
            event = this.registry.restore(delivery.event);
        } catch (error: unknown) {
            if (error instanceof UnknownEventError || error instanceof InvalidEventPayloadError) {
                await this.fail(delivery, error);
                return;
            }
            await this.retryOrFail(delivery, error);
            return;
        }
        await RequestContext.run(
            { requestId: randomUUID(), correlationId: event.metadata.correlationId },
            () => this.handle(delivery, event),
        );
    }

    private async handle(delivery: ClaimedDelivery, event: DomainEvent): Promise<void> {
        const subscriberName = delivery.subscriber;
        const subscriber = this.registry.findSubscriber(delivery.event.eventType, subscriberName);
        if (subscriber === undefined) {
            await this.fail(
                delivery,
                new UnknownSubscriberError('Subscriber is not registered', undefined, {
                    subscriber: subscriberName,
                }),
            );
            return;
        }
        try {
            await this.withHandlerTimeout(
                delivery,
                this.runSubscriber(subscriber, delivery, event),
            );
        } catch (error: unknown) {
            if (error instanceof DeliveryLeaseLostError) {
                this.reportLeaseLost(delivery);
                return;
            }
            if (error instanceof PermanentDeliveryError) {
                await this.fail(delivery, error);
                return;
            }
            await this.retryOrFail(delivery, error);
            return;
        }
        this.metrics.recordProcessed(subscriberName, 'done');
        const lagSeconds =
            (this.clock.now().getTime() - delivery.event.createdAt.getTime()) / MS_IN_SECOND;
        this.metrics.observeDeliveryLag(subscriberName, lagSeconds);
    }

    private runSubscriber(
        subscriber: EventSubscriber,
        delivery: ClaimedDelivery,
        event: DomainEvent,
    ): Promise<void> {
        const work = async (): Promise<void> => {
            await subscriber.handle(event);
            if (!(await this.store.markDone(delivery, this.clock.now()))) {
                throw new DeliveryLeaseLostError('Delivery lease was lost');
            }
        };
        return subscriber.isTransactional === false ? work() : this.transactions.run(work);
    }

    private async withHandlerTimeout(
        delivery: ClaimedDelivery,
        work: Promise<void>,
    ): Promise<void> {
        const timeoutMs = this.settings.handlerTimeoutMs;
        let timer: NodeJS.Timeout | undefined;
        let isTimedOut = false;
        const timeout = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                isTimedOut = true;
                reject(new HandlerTimedOutError('Subscriber timed out', undefined, { timeoutMs }));
            }, timeoutMs);
        });
        work.catch((error: unknown) => {
            if (!isTimedOut) return;
            if (error instanceof DeliveryLeaseLostError) {
                this.reportLeaseLost(delivery);
                return;
            }
            this.logger.warn({ err: error }, 'Timed out outbox handler finished with an error');
        });
        try {
            await Promise.race([work, timeout]);
        } finally {
            clearTimeout(timer);
        }
    }

    private async retryOrFail(delivery: ClaimedDelivery, error: unknown): Promise<void> {
        const attempt = delivery.attempts;
        if (this.retryPolicy.isExhausted(attempt)) {
            await this.fail(delivery, error);
            return;
        }
        const nextAttemptAt = this.nextAttemptAt(attempt, error);
        const isScheduled = await this.store.scheduleRetry(
            delivery,
            attempt,
            nextAttemptAt,
            describeError(error),
        );
        if (!isScheduled) {
            this.reportLeaseLost(delivery);
            return;
        }
        this.logger.warn(
            { eventId: delivery.eventId, subscriber: delivery.subscriber, attempt, err: error },
            'Outbox delivery will be retried',
        );
        this.metrics.recordProcessed(delivery.subscriber, 'retry');
    }

    private nextAttemptAt(attempt: number, error: unknown): Date {
        const now = this.clock.now();
        const policyAttemptAt = this.retryPolicy.nextAttemptAt(attempt, now);
        if (!(error instanceof RetryLaterDeliveryError)) return policyAttemptAt;
        return new Date(Math.max(policyAttemptAt.getTime(), now.getTime() + error.retryAfterMs));
    }

    private async fail(delivery: ClaimedDelivery, error: unknown): Promise<void> {
        const isFailed = await this.store.markFailed(
            delivery,
            delivery.attempts,
            describeError(error),
            this.clock.now(),
        );
        if (!isFailed) {
            this.reportLeaseLost(delivery);
            return;
        }
        this.logger.error(
            {
                eventId: delivery.eventId,
                subscriber: delivery.subscriber,
                attempts: delivery.attempts,
                err: error,
            },
            'Outbox delivery failed',
        );
        this.metrics.recordProcessed(delivery.subscriber, 'failed');
    }

    private reportLeaseLost(lease: DeliveryLease): void {
        this.logger.warn(
            { eventId: lease.eventId, subscriber: lease.subscriber },
            'Outbox delivery lease was lost, result discarded',
        );
    }
}
