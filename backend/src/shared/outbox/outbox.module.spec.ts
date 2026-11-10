import { Global, Injectable, Module, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { afterEach, describe, expect, it } from 'vitest';
import { PG_POOL } from '../../database/postgres/database.constants';
import { InMemoryTransactionRunner } from '../../database/postgres/testing/in-memory-transaction-runner';
import { TransactionRunnerPort } from '../../database/postgres/transaction-runner.port';
import { DomainEventPublisherPort } from '../ddd';
import { DomainEventRegistry } from './application/domain-event-registry';
import { OutboxStorePort } from './application/outbox-store.port';
import { OutboxWakeUpPort } from './application/outbox-wake-up.port';
import { OutboxDomainEventPublisher } from './infrastructure/outbox-domain-event-publisher';
import { OutboxRelay } from './infrastructure/outbox-relay';
import { OutboxSettings } from './infrastructure/outbox-settings';
import { FakeOutboxClock, InMemoryOutboxStore } from './testing/in-memory-outbox-store';
import { thingHappened } from './testing/outbox-fixtures';
import { OutboxModule } from './outbox.module';

const values: Record<string, unknown> = {
    OUTBOX_POLL_INTERVAL_MS: 250,
    OUTBOX_BATCH_SIZE: 20,
    OUTBOX_MAX_ATTEMPTS: 4,
    OUTBOX_RETENTION_DAYS: 3,
};

@Global()
@Module({
    providers: [{ provide: ConfigService, useValue: { get: (key: string) => values[key] } }],
    exports: [ConfigService],
})
class FakeConfigModule {}

@Injectable()
class EventSource {
    constructor(
        readonly publisher: DomainEventPublisherPort,
        readonly registry: DomainEventRegistry,
    ) {}
}

@Module({ providers: [EventSource] })
class ConsumerModule {}

describe('OutboxModule', () => {
    let app: INestApplication | undefined;
    const store = new InMemoryOutboxStore(new FakeOutboxClock(new Date()));
    const transactions = new InMemoryTransactionRunner();

    async function createApp(): Promise<INestApplication> {
        const moduleRef = await Test.createTestingModule({
            imports: [
                FakeConfigModule,
                LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
                OutboxModule,
                ConsumerModule,
            ],
        })
            .overrideProvider(PG_POOL)
            .useValue({ end: () => Promise.resolve() })
            .overrideProvider(TransactionRunnerPort)
            .useValue(transactions)
            .overrideProvider(OutboxStorePort)
            .useValue(store)
            .compile();
        const nestApp = moduleRef.createNestApplication({ logger: false });
        await nestApp.init();
        return nestApp;
    }

    afterEach(async () => {
        await app?.close();
        app = undefined;
    });

    it('provides the publisher and the registry to other modules globally', async () => {
        app = await createApp();
        const source = app.get(EventSource);

        expect(source.publisher).toBeInstanceOf(OutboxDomainEventPublisher);
        expect(source.registry).toBeInstanceOf(DomainEventRegistry);
        expect(source.registry).toBe(app.get(DomainEventRegistry));
    });

    it('reads the settings from the environment', async () => {
        app = await createApp();

        expect(app.get(OutboxSettings)).toMatchObject({
            pollIntervalMs: 250,
            batchSize: 20,
            maxAttempts: 4,
            retentionDays: 3,
        });
    });

    it('wakes the same relay instance that it runs', async () => {
        app = await createApp();

        expect(app.get(OutboxWakeUpPort)).toBe(app.get(OutboxRelay));
    });

    it('starts the relay with the application and publishes through the store', async () => {
        app = await createApp();
        const publisher = app.get(DomainEventPublisherPort);
        store.claimDueDeliveries.mockClear();

        await expect(transactions.run(() => publisher.publish([]))).resolves.toBeUndefined();
        await expect(publisher.publish([thingHappened('aggregate-1')])).rejects.toThrow(
            /inside a transaction/,
        );

        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(store.claimDueDeliveries).toHaveBeenCalled();
    });

    it('stops the relay when the application closes', async () => {
        app = await createApp();
        await app.close();
        app = undefined;
        store.claimDueDeliveries.mockClear();

        await new Promise((resolve) => setTimeout(resolve, 400));

        expect(store.claimDueDeliveries).not.toHaveBeenCalled();
    });
});
