import { ChatOpenAI } from '@langchain/openai';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../shared/config/env.schema';
import { DealAuditorPort } from '../../domain/ports/deal-auditor.port';
import { AUDIT_CHAT_MODEL, DealAuditorAdapter } from './deal-auditor.adapter';

@Module({
    providers: [
        {
            provide: AUDIT_CHAT_MODEL,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): ChatOpenAI => {
                const baseURL = config.get('OPENAI_BASE_URL', { infer: true });
                return new ChatOpenAI({
                    model: config.get('OPENAI_MODEL', { infer: true }),
                    apiKey: config.get('OPENAI_API_KEY', { infer: true }),
                    temperature: 0,
                    timeout: config.get('OPENAI_TIMEOUT_MS', { infer: true }),
                    maxRetries: config.get('OPENAI_MAX_RETRIES', { infer: true }),
                    ...(baseURL === undefined ? {} : { configuration: { baseURL } }),
                });
            },
        },
        { provide: DealAuditorPort, useClass: DealAuditorAdapter },
    ],
    exports: [DealAuditorPort],
})
export class AgentModule {}
