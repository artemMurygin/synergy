import { Inject, Injectable } from '@nestjs/common';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { createAgent, tool, toolStrategy } from 'langchain';
import { z } from 'zod';
import { AuditIssue } from '../../domain/value-objects/audit-issue.value-object';
import { MAX_NOTIFICATION_MESSAGE_LENGTH, type AuditTools } from '../../domain/audit-tools';
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

    async audit(deal: Deal, tools: AuditTools): Promise<AuditIssue[]> {
        const agent = createAgent({
            model: this.model,
            tools: this.buildTools(tools),
            systemPrompt: AUDIT_SYSTEM_PROMPT,
            responseFormat: toolStrategy(auditResultSchema, { handleError: false }),
        });

        const result = await agent.invoke({
            messages: [{ role: 'user', content: this.describeDeal(deal) }],
        });

        const parsed = auditResultSchema.parse(result.structuredResponse);
        return parsed.issues.map((issue) => new AuditIssue(issue));
    }

    private buildTools(tools: AuditTools): StructuredToolInterface[] {
        const getUserTelegramAccountById = tool(
            ({ id }) => tools.getUserTelegramAccountById.invoke(id),
            {
                name: 'get_user_telegram_account_by_id',
                description:
                    'Returns the Telegram username of the active employee by the deal responsibleId, or a not found message.',
                schema: z.object({ id: z.string().describe('responsibleId from the deal') }),
            },
        );
        const notifyResponsible = tool(
            ({ username, message }) => tools.notifyResponsible.invoke(username, message),
            {
                name: 'notify_responsible',
                description:
                    'Queues a Telegram notification for an active employee, identified by the username returned from get_user_telegram_account_by_id.',
                schema: z.object({
                    username: z.string().describe('Telegram username of the employee'),
                    message: z
                        .string()
                        .max(MAX_NOTIFICATION_MESSAGE_LENGTH)
                        .describe('Notification text'),
                }),
            },
        );
        return [getUserTelegramAccountById, notifyResponsible];
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
