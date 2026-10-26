import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/app-config.module';
import { AppLoggerModule } from './logger/app-logger.module';
import { DatabaseModule } from './database/database.module';
import { MssqlModule } from './mssql/mssql.module';
import { QueueModule } from './queue/queue.module';
import { MetricsModule } from './metrics/metrics.module';
import { HealthModule } from './health/health.module';

@Module({
    imports: [
        AppConfigModule,
        AppLoggerModule,
        DatabaseModule,
        MssqlModule,
        MetricsModule,
        QueueModule,
        HealthModule,
    ],
})
export class AppModule {}
