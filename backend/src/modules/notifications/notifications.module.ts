import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostgresModule } from '../../database/postgres/postgres.module';
import type { Env } from '../../shared/config/env.schema';
import { RealtimeBrokerStatus } from '../../shared/realtime/realtime-broker-status';
import { RealtimeBrokerStatusPort } from '../../shared/realtime/realtime-broker-status.port';
import { RealtimeSettings } from '../../shared/realtime/realtime-settings';
import { AuthModule } from '../auth/auth.module';
import { CreateNotificationsUseCase } from './application/create-notifications.use-case';
import { GetUnreadCountUseCase } from './application/get-unread-count.use-case';
import { ListNotificationsUseCase } from './application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from './application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './application/mark-notification-read.use-case';
import { NotificationChannelSubscriptions } from './application/notification-channel-subscriptions';
import { NOTIFICATION_CHANNELS } from './application/notification-channels.token';
import { NotificationEventSubscriptions } from './application/notification-event-subscriptions';
import { ConnectionAuthenticatorPort } from './application/ports/connection-authenticator.port';
import { NotificationChannelMetricsPort } from './application/ports/notification-channel-metrics.port';
import { NotificationCreationMetricsPort } from './application/ports/notification-creation-metrics.port';
import { RealtimeConnectionMetricsPort } from './application/ports/realtime-connection-metrics.port';
import { UserRealtimeEmitterPort } from './application/ports/user-realtime-emitter.port';
import { TaskCreatedSubscriber } from './application/task-created.subscriber';
import type { NotificationChannelPort } from './domain/ports/notification-channel.port';
import { NotificationClockPort } from './domain/ports/notification-clock.port';
import { NotificationRepositoryPort } from './domain/ports/notification-repository.port';
import { UserDirectoryPort } from './domain/ports/user-directory.port';
import { ConnectionAuthenticator } from './infrastructure/connection-authenticator';
import {
    NotificationChannelMetrics,
    notificationChannelFailuresMetricProvider,
} from './infrastructure/notification-channel-metrics';
import { NotificationClock } from './infrastructure/notification-clock';
import {
    NotificationCreationMetrics,
    notificationsCreatedMetricProvider,
} from './infrastructure/notification-creation-metrics';
import { NotificationRepository } from './infrastructure/notification.repository';
import { RealtimeChannel } from './infrastructure/realtime-channel';
import {
    RealtimeConnectionMetrics,
    realtimeConnectionMetricProvider,
} from './infrastructure/realtime-connection-metrics';
import { UserDirectory } from './infrastructure/user-directory';
import { NotificationsController } from './interface/http/notifications.controller';
import { registerNotificationErrorStatuses } from './interface/notifications-error-status';
import { NotificationsGateway } from './interface/ws/notifications.gateway';
import { UserRealtimeEmitter } from './interface/ws/user-realtime-emitter';

@Module({
    imports: [PostgresModule, AuthModule],
    controllers: [NotificationsController],
    providers: [
        ListNotificationsUseCase,
        GetUnreadCountUseCase,
        MarkNotificationReadUseCase,
        MarkAllNotificationsReadUseCase,
        CreateNotificationsUseCase,
        TaskCreatedSubscriber,
        NotificationEventSubscriptions,
        NotificationChannelSubscriptions,
        NotificationsGateway,
        UserRealtimeEmitter,
        RealtimeBrokerStatus,
        { provide: RealtimeBrokerStatusPort, useExisting: RealtimeBrokerStatus },
        { provide: UserRealtimeEmitterPort, useExisting: UserRealtimeEmitter },
        RealtimeChannel,
        {
            provide: NOTIFICATION_CHANNELS,
            inject: [RealtimeChannel],
            useFactory: (...channels: NotificationChannelPort[]): NotificationChannelPort[] =>
                channels,
        },
        {
            provide: RealtimeSettings,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => RealtimeSettings.fromConfig(config),
        },
        { provide: ConnectionAuthenticatorPort, useClass: ConnectionAuthenticator },
        { provide: NotificationRepositoryPort, useClass: NotificationRepository },
        { provide: UserDirectoryPort, useClass: UserDirectory },
        { provide: NotificationClockPort, useClass: NotificationClock },
        realtimeConnectionMetricProvider,
        { provide: RealtimeConnectionMetricsPort, useClass: RealtimeConnectionMetrics },
        notificationChannelFailuresMetricProvider,
        { provide: NotificationChannelMetricsPort, useClass: NotificationChannelMetrics },
        notificationsCreatedMetricProvider,
        { provide: NotificationCreationMetricsPort, useClass: NotificationCreationMetrics },
    ],
    exports: [NotificationChannelSubscriptions],
})
export class NotificationsModule implements OnModuleInit {
    onModuleInit(): void {
        registerNotificationErrorStatuses();
    }
}
