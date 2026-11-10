import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresModule } from '../../database/postgres/postgres.module';
import type { Env } from '../config/env.schema';
import { DomainEventPublisherPort } from '../ddd';
import { DomainEventRegistry } from './application/domain-event-registry';
import { OutboxClockPort } from './application/outbox-clock.port';
import { OutboxMetricsPort } from './application/outbox-metrics.port';
import { OutboxStorePort } from './application/outbox-store.port';
import { OutboxWakeUpPort } from './application/outbox-wake-up.port';
import { OutboxClock } from './infrastructure/outbox-clock';
import { OutboxDomainEventPublisher } from './infrastructure/outbox-domain-event-publisher';
import { OutboxMetrics, outboxMetricProviders } from './infrastructure/outbox-metrics';
import { OutboxRelay } from './infrastructure/outbox-relay';
import { OutboxSettings } from './infrastructure/outbox-settings';
import { OutboxStore } from './infrastructure/outbox-store';

@Global()
@Module({
    imports: [PostgresModule],
    providers: [
        DomainEventRegistry,
        {
            provide: OutboxSettings,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => OutboxSettings.fromConfig(config),
        },
        ...outboxMetricProviders,
        { provide: OutboxMetricsPort, useClass: OutboxMetrics },
        { provide: OutboxClockPort, useClass: OutboxClock },
        { provide: OutboxStorePort, useClass: OutboxStore },
        OutboxRelay,
        { provide: OutboxWakeUpPort, useExisting: OutboxRelay },
        { provide: DomainEventPublisherPort, useClass: OutboxDomainEventPublisher },
    ],
    exports: [DomainEventRegistry, DomainEventPublisherPort],
})
export class OutboxModule {}
