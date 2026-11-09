import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import { describe, expect, it } from 'vitest';
import { Deal } from '../../domain/entities/deal.entity';
import { DealId } from '../../domain/value-objects/deal-id.value-object';
import { DealAuditorAdapter } from './deal-auditor.adapter';

interface ScriptedToolCall {
    name: string | null;
    args: Record<string, unknown>;
}

const EXTRACT_TOOL_NAME = /^extract-\d+$/;

function isFunctionToolDefinition(value: unknown): value is { function: { name: string } } {
    if (typeof value !== 'object' || value === null || !('function' in value)) {
        return false;
    }
    const definition = value.function;
    return (
        typeof definition === 'object' &&
        definition !== null &&
        'name' in definition &&
        typeof definition.name === 'string'
    );
}

class ScriptedChatModel extends BaseChatModel {
    readonly receivedMessages: BaseMessage[][] = [];
    private responseToolName: string | null = null;
    private step = 0;

    constructor(private readonly script: ScriptedToolCall[][]) {
        super({});
    }

    _llmType(): string {
        return 'scripted';
    }

    bindTools(tools: unknown[]): this {
        for (const boundTool of tools) {
            if (
                isFunctionToolDefinition(boundTool) &&
                EXTRACT_TOOL_NAME.test(boundTool.function.name)
            ) {
                this.responseToolName = boundTool.function.name;
            }
        }
        return this;
    }

    _generate(messages: BaseMessage[]): Promise<ChatResult> {
        this.receivedMessages.push(messages);
        const calls = this.script[this.step] ?? [];
        this.step += 1;
        const toolCalls = calls.map((call, index) => ({
            id: `call-${String(this.step)}-${String(index)}`,
            name: call.name ?? this.resolveResponseToolName(),
            args: call.args,
        }));
        const message = new AIMessage({ content: '', tool_calls: toolCalls });
        return Promise.resolve({ generations: [{ text: '', message }] });
    }

    private resolveResponseToolName(): string {
        if (this.responseToolName === null) {
            throw new Error('Response tool is not bound');
        }
        return this.responseToolName;
    }
}

function createDeal(): Deal {
    return Deal.create({
        id: new DealId('100'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        clientName: 'Anna',
        phone: null,
        program: 'MBA',
        studyForm: null,
        leadSource: 'site',
        pipelineStage: 'new',
        responsibleId: '42',
    });
}

describe('DealAuditorAdapter', () => {
    it('maps the structured response into audit issues', async () => {
        const model = new ScriptedChatModel([
            [
                {
                    name: null,
                    args: {
                        verdict: 'violations',
                        issues: [
                            { field: 'phone', reason: 'phone is empty' },
                            { field: 'studyForm', reason: 'study form is empty' },
                        ],
                    },
                },
            ],
        ]);

        const issues = await new DealAuditorAdapter(model).audit(createDeal());

        expect(issues.map((issue) => [issue.field, issue.reason])).toEqual([
            ['phone', 'phone is empty'],
            ['studyForm', 'study form is empty'],
        ]);
    });

    it('returns no issues for the ok verdict', async () => {
        const model = new ScriptedChatModel([
            [{ name: null, args: { verdict: 'ok', issues: [] } }],
        ]);

        await expect(new DealAuditorAdapter(model).audit(createDeal())).resolves.toEqual([]);
    });

    it('passes the deal to the model as data', async () => {
        const model = new ScriptedChatModel([
            [
                {
                    name: null,
                    args: { verdict: 'violations', issues: [{ field: 'phone', reason: 'empty' }] },
                },
            ],
        ]);

        const issues = await new DealAuditorAdapter(model).audit(createDeal());

        expect(issues).toHaveLength(1);
        const firstPrompt = model.receivedMessages[0].map((message) => message.text).join('\n');
        expect(firstPrompt).toContain('<deal>');
        expect(firstPrompt).toContain('"responsibleId":"42"');
    });

    it('fails when the structured response is invalid', async () => {
        const model = new ScriptedChatModel([
            [{ name: null, args: { verdict: 'bogus', issues: [] } }],
        ]);

        await expect(new DealAuditorAdapter(model).audit(createDeal())).rejects.toThrow();
    });

    it('fails when the model reports an unknown field', async () => {
        const model = new ScriptedChatModel([
            [
                {
                    name: null,
                    args: { verdict: 'violations', issues: [{ field: 'email', reason: 'empty' }] },
                },
            ],
        ]);

        await expect(new DealAuditorAdapter(model).audit(createDeal())).rejects.toThrow();
    });
});
