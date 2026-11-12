import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RequestContextMiddleware } from './shared/context/request-context.middleware';
import { HttpExceptionFilter } from './shared/http/http-exception.filter';
import { AppConfigModule } from './shared/config/app-config.module';
import { AppLoggerModule } from './shared/logger/app-logger.module';
import { MetricsModule } from './shared/metrics/metrics.module';
import { MssqlModule } from './database/mssql/mssql.module';
import { HealthModule } from './shared/health/health.module';
import { OutboxModule } from './shared/outbox/outbox.module';
import { QueueRootModule } from './shared/queue/queue-root.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditAgentModule } from './modules/audit-agent/audit-agent.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { SheetsQaModule } from './modules/sheets-qa/sheets-qa.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { FilesModule } from './modules/files/files.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { MeetingChatModule } from './modules/transcription/meeting/meeting-chat.module';

@Module({
    imports: [
        AppConfigModule,
        AppLoggerModule,
        MssqlModule,
        MetricsModule,
        HealthModule,
        OutboxModule,
        QueueRootModule,
        AuthModule,
        AuditAgentModule,
        SheetsQaModule,
        AssistantModule,
        TasksModule,
        FilesModule,
        NotificationsModule,
        TelegramModule,
        MeetingChatModule,
    ],
    providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer
            .apply(RequestContextMiddleware)
            .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    }
}
