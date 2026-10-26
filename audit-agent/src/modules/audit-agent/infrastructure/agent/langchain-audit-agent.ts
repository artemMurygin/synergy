import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import {
    AuditAgent,
    type AuditAgentInput,
    type AuditAgentResult,
} from '../../domain/audit/audit-agent';
import type { Env } from '../../../../shared/config/env.schema';
import { buildAgentGraph } from './agent.graph';

@Injectable()
export class LangchainAuditAgent extends AuditAgent {
    private model?: ChatOpenAI;
    private readonly graph = buildAgentGraph({ ask: (query) => this.ask(query) });

    constructor(private readonly config: ConfigService<Env, true>) {
        super();
    }

    run(input: AuditAgentInput): Promise<AuditAgentResult> {
        return this.graph.invoke(input);
    }

    private async ask(query: string): Promise<string> {
        // Модель создаётся лениво: без OPENAI_API_KEY приложение всё равно стартует
        this.model ??= new ChatOpenAI({
            model: this.config.get('OPENAI_MODEL', { infer: true }),
            apiKey: this.config.get('OPENAI_API_KEY', { infer: true }),
        });
        const res = await this.model.invoke(query);
        return typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
    }
}
