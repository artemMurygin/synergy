import { ChatOpenAI } from '@langchain/openai';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../shared/config/env.schema';
import type {
    CatalogQueryPort,
    ProgramsSyncMetricsPort,
    SheetsReaderPort,
} from '../application/ports/programs-etl.ports';
import {
    CATALOG_QUERY_PORT,
    PROGRAMS_AGENT_PORT,
    PROGRAMS_SYNC_METRICS_PORT,
    SHEETS_READER_PORT,
} from '../programs-etl.tokens';
import { DeepAgentsProgramsAgent } from './deepagents-programs-agent';
import { toToolLogFields } from './metrics/programs-sync-log-fields';
import { ProgramsEtlObservabilityModule } from './programs-etl-observability.module';
import { ProgramsEtlPersistenceModule } from './programs-etl-persistence.module';
import { ProgramsEtlSheetsModule } from './programs-etl-sheets.module';

@Module({
    imports: [
        ProgramsEtlPersistenceModule,
        ProgramsEtlSheetsModule,
        ProgramsEtlObservabilityModule,
    ],
    providers: [
        {
            provide: PROGRAMS_AGENT_PORT,
            inject: [
                ConfigService,
                SHEETS_READER_PORT,
                CATALOG_QUERY_PORT,
                PinoLogger,
                PROGRAMS_SYNC_METRICS_PORT,
            ],
            useFactory: (
                config: ConfigService<Env, true>,
                sheetsReader: SheetsReaderPort,
                catalogQuery: CatalogQueryPort,
                logger: PinoLogger,
                metrics: ProgramsSyncMetricsPort,
            ): DeepAgentsProgramsAgent => {
                const apiKey = config.get('OPENAI_API_KEY', { infer: true });
                const baseURL = config.get('OPENAI_BASE_URL', { infer: true });
                return new DeepAgentsProgramsAgent({
                    modelFactory: (model) =>
                        new ChatOpenAI({
                            model,
                            apiKey,
                            temperature: 0,
                            ...(baseURL === undefined ? {} : { configuration: { baseURL } }),
                        }),
                    model: config.get('PROGRAMS_ETL_OPENAI_MODEL', { infer: true }),
                    maxSteps: config.get('PROGRAMS_ETL_AGENT_MAX_STEPS', { infer: true }),
                    timeoutMs: config.get('PROGRAMS_ETL_AGENT_TIMEOUT_MS', { infer: true }),
                    sheetsReader,
                    catalogQuery,
                    logger: {
                        log: (entry) => {
                            logger.info(toToolLogFields(entry), 'Agent tool call');
                        },
                    },
                    metrics,
                });
            },
        },
    ],
    exports: [PROGRAMS_AGENT_PORT],
})
export class ProgramsEtlAgentModule {}
