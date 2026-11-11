import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import { PostgresModule } from '../../database/postgres/postgres.module';
import type { Env } from '../../shared/config/env.schema';
import { OutboxSettings } from '../../shared/outbox/infrastructure/outbox-settings';
import { AssistantModule } from '../assistant/assistant.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssistantFreeTextHandler } from './application/assistant-free-text-handler';
import { BotUpdateDispatcher } from './application/bot-update-dispatcher';
import { GetTelegramLinkStatusUseCase } from './application/get-telegram-link-status.use-case';
import { IdentityResolver } from './application/identity-resolver';
import { IssueLinkTokenUseCase } from './application/issue-link-token.use-case';
import { LinkAccountUseCase } from './application/link-account.use-case';
import { LinkTokenThrottler } from './application/link-token-throttler';
import { BotMessengerPort } from './application/ports/bot-messenger.port';
import { FreeTextHandlerPort } from './application/ports/free-text-handler.port';
import { RequestRateCounterPort } from './application/ports/request-rate-counter.port';
import { TelegramMessageMetricsPort } from './application/ports/telegram-message-metrics.port';
import { TelegramSettingsPort } from './application/ports/telegram-settings.port';
import { TelegramUpdateMetricsPort } from './application/ports/telegram-update-metrics.port';
import { UpdateDeduplicatorPort } from './application/ports/update-deduplicator.port';
import { UserDirectoryPort } from './application/ports/user-directory.port';
import { SetTelegramNotificationsUseCase } from './application/set-telegram-notifications.use-case';
import { UnlinkAccountUseCase } from './application/unlink-account.use-case';
import { ClockPort } from './domain/ports/clock.port';
import { LinkTokenStorePort } from './domain/ports/link-token-store.port';
import { TelegramDeliveryLogPort } from './domain/ports/telegram-delivery-log.port';
import { TelegramLinkRepositoryPort } from './domain/ports/telegram-link-repository.port';
import { LinkTokenStore } from './infrastructure/cache/link-token-store';
import { PollerLock } from './infrastructure/cache/poller-lock';
import { RequestRateCounter } from './infrastructure/cache/request-rate-counter';
import {
    TelegramRedisLifecycle,
    telegramRedisProvider,
} from './infrastructure/cache/telegram-redis.provider';
import { TELEGRAM_REDIS } from './infrastructure/cache/telegram-redis.token';
import { UpdateDeduplicator } from './infrastructure/cache/update-deduplicator';
import { TelegramSettings } from './infrastructure/config/telegram-settings';
import { TelegramDeliveryLog } from './infrastructure/persistence/telegram-delivery-log';
import { TelegramLinkRepository } from './infrastructure/persistence/telegram-link.repository';
import { BotApiClient } from './infrastructure/telegram/bot-api-client';
import { BotMessenger } from './infrastructure/telegram/bot-messenger';
import { MessengerChannelRegistration } from './infrastructure/telegram/messenger-channel-registration';
import { MessengerChannel } from './infrastructure/telegram/messenger.channel';
import {
    TelegramMessageMetrics,
    telegramMessagesSentMetricProvider,
    telegramSendErrorsMetricProvider,
} from './infrastructure/telegram/telegram-message-metrics';
import {
    TelegramUpdateMetrics,
    telegramUpdatesMetricProvider,
} from './infrastructure/telegram/telegram-update-metrics';
import { TelegramUpdatesBootstrap } from './infrastructure/telegram/telegram-updates-bootstrap';
import { TelegramUpdatesPoller } from './infrastructure/telegram/telegram-updates-poller';
import { Clock } from './infrastructure/time/clock';
import { UserDirectory } from './infrastructure/users/user-directory';
import { LinkTokenThrottlerGuard } from './interface/http/link-token-throttler.guard';
import { TelegramLinkController } from './interface/http/telegram-link.controller';
import { TelegramWebhookController } from './interface/http/telegram-webhook.controller';
import { registerTelegramErrorStatuses } from './interface/telegram-error-status';

@Module({
    imports: [PostgresModule, AuthModule, NotificationsModule, AssistantModule],
    controllers: [TelegramLinkController, TelegramWebhookController],
    providers: [
        {
            provide: TelegramSettingsPort,
            inject: [ConfigService, OutboxSettings],
            useFactory: (config: ConfigService<Env, true>, outbox: OutboxSettings) =>
                TelegramSettings.fromConfig(config, outbox),
        },
        telegramRedisProvider,
        TelegramRedisLifecycle,
        { provide: ClockPort, useClass: Clock },
        { provide: UserDirectoryPort, useClass: UserDirectory },
        { provide: TelegramLinkRepositoryPort, useClass: TelegramLinkRepository },
        { provide: TelegramDeliveryLogPort, useClass: TelegramDeliveryLog },
        { provide: LinkTokenStorePort, useClass: LinkTokenStore },
        { provide: UpdateDeduplicatorPort, useClass: UpdateDeduplicator },
        { provide: RequestRateCounterPort, useClass: RequestRateCounter },
        {
            provide: PollerLock,
            inject: [TELEGRAM_REDIS],
            useFactory: (redis: Redis): PollerLock => new PollerLock(redis),
        },
        BotApiClient,
        { provide: BotMessengerPort, useClass: BotMessenger },
        { provide: FreeTextHandlerPort, useClass: AssistantFreeTextHandler },
        telegramUpdatesMetricProvider,
        { provide: TelegramUpdateMetricsPort, useClass: TelegramUpdateMetrics },
        telegramMessagesSentMetricProvider,
        telegramSendErrorsMetricProvider,
        { provide: TelegramMessageMetricsPort, useClass: TelegramMessageMetrics },
        IssueLinkTokenUseCase,
        GetTelegramLinkStatusUseCase,
        LinkAccountUseCase,
        UnlinkAccountUseCase,
        SetTelegramNotificationsUseCase,
        IdentityResolver,
        BotUpdateDispatcher,
        LinkTokenThrottler,
        LinkTokenThrottlerGuard,
        TelegramUpdatesPoller,
        TelegramUpdatesBootstrap,
        MessengerChannel,
        MessengerChannelRegistration,
    ],
})
export class TelegramModule implements OnModuleInit {
    onModuleInit(): void {
        registerTelegramErrorStatuses();
    }
}
