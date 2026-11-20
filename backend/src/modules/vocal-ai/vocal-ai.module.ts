import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PostgresModule } from '../../database/postgres/postgres.module';
import { VOCAL_AI_AGENT_CAPABILITY } from '../../shared/agent-capability';
import type { Env } from '../../shared/config/env.schema';
import type { ChatModelSetting } from '../../shared/llm';
import { createChatModel } from '../../shared/llm';
import {
    BACKFILL_FROM_AT,
    BACKFILL_PAGE_WINDOW_MS,
    BackfillProjectCallsUseCase,
} from './application/use-cases/backfill-project-calls.use-case';
import { GetCallDetailUseCase } from './application/use-cases/get-call-detail.use-case';
import { GetCallStatsUseCase } from './application/use-cases/get-call-stats.use-case';
import { GetCallTranscriptUseCase } from './application/use-cases/get-call-transcript.use-case';
import { ListCallsUseCase } from './application/use-cases/list-calls.use-case';
import { SyncProjectCallsUseCase } from './application/use-cases/sync-project-calls.use-case';
import { CallRepositoryPort } from './domain/ports/call-repository.port';
import { CallTranscriptRepositoryPort } from './domain/ports/call-transcript-repository.port';
import { SyncCursorRepositoryPort } from './domain/ports/sync-cursor-repository.port';
import { VocalAiGatewayPort } from './domain/ports/vocal-ai-gateway.port';
import type {
    VocalAiHttpClient,
    VocalAiHttpRequest,
} from './infrastructure/vocal-ai/vocal-ai-gateway.adapter';
import { VocalAiGateway } from './infrastructure/vocal-ai/vocal-ai-gateway.adapter';
import { QUEUE_NAMES } from './infrastructure/queue/queue.constants';
import { VocalAiSyncScheduler } from './infrastructure/queue/vocal-ai-sync-scheduler';
import { CallRepository } from './infrastructure/persistence/slonik-call.repository';
import { CallTranscriptRepository } from './infrastructure/persistence/slonik-call-transcript.repository';
import { SyncCursorRepository } from './infrastructure/persistence/slonik-sync-cursor.repository';
import { VocalAiAgentCapability } from './interface/agent/vocal-ai-agent.capability';
import { VocalAiSyncProcessor } from './interface/queue/vocal-ai-sync.processor';

const BACKFILL_PAGE_WINDOW_DAYS = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

const VOCAL_AI_AGENT_MODEL: ChatModelSetting = {
    name: 'anthropic/claude-haiku-5.5',
    provider: 'openrouter',
    reasoningEffort: 'low',
    promptCache: true,
};

/** Sends VocalAI HTTP requests with the global `fetch`; the gateway adapter owns retry and auth. */
function createVocalAiHttpClient(baseUrl: string): VocalAiHttpClient {
    return {
        async send(request: VocalAiHttpRequest) {
            const url = new URL(request.path, baseUrl);
            for (const [key, value] of Object.entries(request.query ?? {})) {
                url.searchParams.set(key, value);
            }
            const response = await fetch(url, {
                method: request.method,
                headers: {
                    'Content-Type': 'application/json',
                    ...(request.accessToken === undefined
                        ? {}
                        : { Authorization: `Bearer ${request.accessToken}` }),
                },
                ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
            });
            const body: unknown = await response.json().catch(() => null);
            return { status: response.status, body };
        },
    };
}

@Module({
    imports: [
        PostgresModule,
        BullModule.registerQueueAsync({
            name: QUEUE_NAMES.VOCAL_AI_SYNC,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                defaultJobOptions: {
                    attempts: config.get('VOCAL_AI_SYNC_ATTEMPTS', { infer: true }),
                    backoff: {
                        type: 'exponential',
                        delay: config.get('VOCAL_AI_SYNC_BACKOFF_MS', { infer: true }),
                    },
                },
            }),
        }),
    ],
    providers: [
        { provide: CallRepositoryPort, useClass: CallRepository },
        { provide: CallTranscriptRepositoryPort, useClass: CallTranscriptRepository },
        { provide: SyncCursorRepositoryPort, useClass: SyncCursorRepository },
        {
            provide: VocalAiGatewayPort,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): VocalAiGatewayPort => {
                const baseUrl = config.get('VOCAL_AI_BASE_URL', { infer: true });
                const synergyLogin: string | undefined = config.get('VOCAL_AI_SYNERGY_LOGIN', {
                    infer: true,
                });
                const synergyPassword: string | undefined = config.get(
                    'VOCAL_AI_SYNERGY_PASSWORD',
                    { infer: true },
                );
                return new VocalAiGateway(createVocalAiHttpClient(baseUrl), {
                    baseUrl,
                    synergyLogin: synergyLogin ?? '',
                    synergyPassword: synergyPassword ?? '',
                    maxAttempts: config.get('VOCAL_AI_SYNC_ATTEMPTS', { infer: true }),
                    backoffMs: config.get('VOCAL_AI_SYNC_BACKOFF_MS', { infer: true }),
                });
            },
        },
        {
            provide: BACKFILL_PAGE_WINDOW_MS,
            useValue: BACKFILL_PAGE_WINDOW_DAYS * DAY_MS,
        },
        {
            provide: BACKFILL_FROM_AT,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): Date => {
                const backfillFromDate = config.get('VOCAL_AI_BACKFILL_FROM_DATE', {
                    infer: true,
                });
                return backfillFromDate === undefined ? new Date(0) : new Date(backfillFromDate);
            },
        },
        BackfillProjectCallsUseCase,
        SyncProjectCallsUseCase,
        ListCallsUseCase,
        GetCallDetailUseCase,
        GetCallTranscriptUseCase,
        GetCallStatsUseCase,
        VocalAiSyncScheduler,
        VocalAiSyncProcessor,
        {
            provide: VOCAL_AI_AGENT_CAPABILITY,
            inject: [
                ConfigService,
                ListCallsUseCase,
                GetCallDetailUseCase,
                GetCallTranscriptUseCase,
                GetCallStatsUseCase,
            ],
            useFactory: (
                config: ConfigService<Env, true>,
                listCalls: ListCallsUseCase,
                getCallDetail: GetCallDetailUseCase,
                getCallTranscript: GetCallTranscriptUseCase,
                getCallStats: GetCallStatsUseCase,
            ): VocalAiAgentCapability =>
                new VocalAiAgentCapability(
                    { listCalls, getCallDetail, getCallTranscript, getCallStats },
                    createChatModel(config, VOCAL_AI_AGENT_MODEL),
                ),
        },
    ],
    exports: [VOCAL_AI_AGENT_CAPABILITY],
})
export class VocalAiModule {}
