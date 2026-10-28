import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RequestContextMiddleware } from './shared/context/request-context.middleware';
import { HttpExceptionFilter } from './shared/http/http-exception.filter';
import { AppConfigModule } from './shared/config/app-config.module';
import { AppLoggerModule } from './shared/logger/app-logger.module';
import { MetricsModule } from './shared/metrics/metrics.module';
import { MssqlModule } from './database/mssql/mssql.module';
import { HealthModule } from './shared/health/health.module';
import { AuditAgentModule } from './modules/audit-agent/audit-agent.module';

@Module({
    imports: [
        AppConfigModule,
        AppLoggerModule,
        MssqlModule,
        MetricsModule,
        HealthModule,
        AuditAgentModule,
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
