import { Inject, Injectable } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createAgent, toolStrategy } from 'langchain';
import { AuditIssue } from '../../domain/value-objects/audit-issue.value-object';
import type { Deal } from '../../domain/entities/deal.entity';
import { DealAuditorPort } from '../../domain/ports/deal-auditor.port';
import { AUDIT_SYSTEM_PROMPT } from './audit-prompt';
import { auditResultSchema } from './audit-result.schema';

export const AUDIT_CHAT_MODEL = Symbol('AUDIT_CHAT_MODEL');

@Injectable()
export class DealAuditorAdapter extends DealAuditorPort {
    constructor(@Inject(AUDIT_CHAT_MODEL) private readonly model: BaseChatModel) {
        super();
    }

    async audit(deal: Deal): Promise<AuditIssue[]> {
        const agent = createAgent({
            model: this.model,
            tools: [],
            systemPrompt: AUDIT_SYSTEM_PROMPT,
            responseFormat: toolStrategy(auditResultSchema, { handleError: false }),
        });

        const result = await agent.invoke({
            messages: [{ role: 'user', content: this.describeDeal(deal) }],
        });

        const parsed = auditResultSchema.parse(result.structuredResponse);
        return parsed.issues.map((issue) => new AuditIssue(issue));
    }

    private describeDeal(deal: Deal): string {
        const payload = {
            id: deal.id,
            clientName: deal.clientName,
            phone: deal.phone,
            program: deal.program,
            studyForm: deal.studyForm,
            leadSource: deal.leadSource,
            pipelineStage: deal.pipelineStage,
            responsibleId: deal.responsibleId,
        };
        return `<deal>${JSON.stringify(payload)}</deal>`;
    }
}
