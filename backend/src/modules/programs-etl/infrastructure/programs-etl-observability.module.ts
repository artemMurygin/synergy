import { Module } from '@nestjs/common';
import { programsEtlMetricProviders } from './metrics/programs-etl-metrics.constants';
import { PinoProgramsSyncLogger } from './metrics/pino-programs-sync-logger';
import { PrometheusProgramsSyncMetrics } from './metrics/prometheus-programs-sync-metrics';
import { PROGRAMS_SYNC_LOGGER_PORT, PROGRAMS_SYNC_METRICS_PORT } from '../programs-etl.tokens';

@Module({
    providers: [
        ...programsEtlMetricProviders,
        { provide: PROGRAMS_SYNC_METRICS_PORT, useClass: PrometheusProgramsSyncMetrics },
        { provide: PROGRAMS_SYNC_LOGGER_PORT, useClass: PinoProgramsSyncLogger },
    ],
    exports: [PROGRAMS_SYNC_METRICS_PORT, PROGRAMS_SYNC_LOGGER_PORT],
})
export class ProgramsEtlObservabilityModule {}
