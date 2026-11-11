import type { ChatOpenAI } from '@langchain/openai';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../shared/config/env.schema';
import { createChatModel } from '../../../../shared/llm';
import { DealAuditorPort } from '../../domain/ports/deal-auditor.port';
import { AUDIT_CHAT_MODEL, DealAuditorAdapter } from './deal-auditor.adapter';

@Module({
    providers: [
        {
            provide: AUDIT_CHAT_MODEL,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): ChatOpenAI => {
                return createChatModel(config, {
                    name: config.get('OPENAI_MODEL', { infer: true }),
                    provider: 'omniroute',
                });
            },
        },
        { provide: DealAuditorPort, useClass: DealAuditorAdapter },
    ],
    exports: [DealAuditorPort],
})
export class AgentModule {}
