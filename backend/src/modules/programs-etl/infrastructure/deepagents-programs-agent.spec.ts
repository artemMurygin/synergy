import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { ChatResult } from '@langchain/core/outputs';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { ProgramsSyncError } from '../application/errors/programs-sync.error';
import { createProgramsGroup } from '../application/models/programs-group';
import type { ProgramsGroup } from '../application/models/programs-group';
import type { CatalogQueryPort, SheetsReaderPort } from '../application/ports/programs-etl.ports';
import { DeepAgentsProgramsAgent } from './deepagents-programs-agent';

interface ScriptedCall {
    name: string | null;
    args: Record<string, unknown>;
}

const EXTRACT_TOOL_NAME = /^extract-\d+$/;

function functionToolName(value: unknown): string | null {
    if (typeof value !== 'object' || value === null) return null;
    if ('name' in value && typeof value.name === 'string') return value.name;
    if (!('function' in value)) return null;
    const fn = value.function;
    if (typeof fn !== 'object' || fn === null || !('name' in fn)) return null;
    return typeof fn.name === 'string' ? fn.name : null;
}

class ScriptedChatModel extends BaseChatModel {
    readonly receivedMessages: BaseMessage[][] = [];
    readonly boundToolNames: string[] = [];
    private responseToolName: string | null = null;
    private step = 0;

    constructor(
        private readonly script: ScriptedCall[][],
        private readonly hangAfterScript = false,
    ) {
        super({});
    }

    _llmType(): string {
        return 'scripted';
    }

    bindTools(tools: unknown[]): this {
        for (const bound of tools) {
            const name = functionToolName(bound);
            if (name === null) continue;
            this.boundToolNames.push(name);
            if (EXTRACT_TOOL_NAME.test(name)) this.responseToolName = name;
        }
        return this;
    }

    _generate(messages: BaseMessage[], options: object): Promise<ChatResult> {
        this.receivedMessages.push(messages);
        const optionTools = 'tools' in options && Array.isArray(options.tools) ? options.tools : [];
        for (const bound of optionTools as unknown[]) {
            const name = functionToolName(bound);
            if (name !== null) this.boundToolNames.push(name);
        }
        if (this.hangAfterScript && this.step >= this.script.length) {
            return new Promise<ChatResult>(() => undefined);
        }
        const calls = this.script[this.step] ?? [];
        this.step += 1;
        const toolCalls = calls.map((call, index) => ({
            id: `call-${String(this.step)}-${String(index)}`,
            name: call.name ?? this.responseToolName ?? 'missing',
            args: call.args,
        }));
        const message = new AIMessage({ content: '', tool_calls: toolCalls });
        return Promise.resolve({ generations: [{ text: '', message }] });
    }
}

const group: ProgramsGroup = createProgramsGroup({
    id: 'g1',
    name: 'Group 1',
    status: 'ready',
    sources: [
        {
            sourceId: 's1',
            book: 'book',
            spreadsheetId: 'sp1',
            sheetId: 1,
            title: 'Sheet 1',
            url: 'https://example.test/s1',
        },
    ],
});

const planArgs = {
    operations: [
        {
            kind: 'create',
            record_type: 'program',
            data: {
                organizationId: '11111111-1111-4111-8111-111111111111',
                level: 'spo',
                title: 'Program A',
            },
            sources: [{ source_id: 's1', row_numbers: [3, 4] }],
        },
        {
            kind: 'update',
            record_type: 'price',
            record_id: 'price-1',
            data: { amount: 100 },
            sources: [{ source_id: 's1', row_numbers: [5], ranges: ['A5:C5'] }],
        },
    ],
};

interface Deps {
    sheetsReader: SheetsReaderPort;
    catalogQuery: CatalogQueryPort;
    readRange: Mock;
    log: Mock;
}

function makeDeps(): Deps {
    const readRange = vi.fn(() =>
        Promise.resolve({ sourceId: 's1', range: 'A1:B2', rows: [], truncated: false }),
    );
    const sheetsReader: SheetsReaderPort = { readFingerprints: vi.fn(), readRange };
    const catalogQuery: CatalogQueryPort = {
        searchRecords: vi.fn(() => Promise.resolve([])),
        getRecord: vi.fn(() => Promise.resolve(null)),
        listSourceRecords: vi.fn(() => Promise.resolve([])),
    };
    const log = vi.fn();
    return { sheetsReader, catalogQuery, readRange, log };
}

function makeAgent(
    model: BaseChatModel,
    overrides?: Partial<{ maxSteps: number; timeoutMs: number }>,
    deps = makeDeps(),
): { agent: DeepAgentsProgramsAgent; modelFactory: Mock; deps: Deps } {
    const modelFactory = vi.fn(() => model);
    const agent = new DeepAgentsProgramsAgent({
        modelFactory,
        sheetsReader: deps.sheetsReader,
        catalogQuery: deps.catalogQuery,
        logger: { log: deps.log },
        model: 'gpt-test',
        maxSteps: overrides?.maxSteps ?? 40,
        timeoutMs: overrides?.timeoutMs ?? 5000,
    });
    return { agent, modelFactory, deps };
}

const input = {
    runId: 'run-1',
    group,
    changedSources: [{ sourceId: 's1', observedHash: 'h1' }],
};

describe('DeepAgentsProgramsAgent', () => {
    it('returns a structured create/update mutation plan with provenance', async () => {
        const model = new ScriptedChatModel([[{ name: null, args: planArgs }]]);
        const { agent } = makeAgent(model);

        const plan = await agent.buildMutationPlan(input);

        expect(plan.operations).toEqual([
            {
                kind: 'create',
                recordType: 'program',
                data: {
                    organizationId: '11111111-1111-4111-8111-111111111111',
                    level: 'spo',
                    title: 'Program A',
                },
                sources: [{ sourceId: 's1', rowNumbers: [3, 4] }],
            },
            {
                kind: 'update',
                recordType: 'price',
                recordId: 'price-1',
                data: { amount: 100 },
                sources: [{ sourceId: 's1', rowNumbers: [5], ranges: ['A5:C5'] }],
            },
        ]);
    });

    it('binds read-only run tools and mentions the changed sources in the prompt', async () => {
        const model = new ScriptedChatModel([[{ name: null, args: { operations: [] } }]]);
        const { agent } = makeAgent(model);

        await agent.buildMutationPlan(input);

        expect(model.boundToolNames).toEqual(
            expect.arrayContaining([
                'list_group_sources',
                'read_sheet_range',
                'search_catalog_records',
                'get_catalog_record',
                'list_source_records',
            ]),
        );
        const sent = JSON.stringify(model.receivedMessages[0]);
        expect(sent).toContain('s1');
    });

    it('creates a new model and tool scope for every run', async () => {
        const first = new ScriptedChatModel([[{ name: null, args: { operations: [] } }]]);
        const second = new ScriptedChatModel([[{ name: null, args: { operations: [] } }]]);
        const deps = makeDeps();
        const modelFactory = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
        const agent = new DeepAgentsProgramsAgent({
            modelFactory,
            sheetsReader: deps.sheetsReader,
            catalogQuery: deps.catalogQuery,
            logger: { log: deps.log },
            model: 'gpt-configured',
            maxSteps: 40,
            timeoutMs: 5000,
        });

        await agent.buildMutationPlan(input);
        await agent.buildMutationPlan({ ...input, runId: 'run-2' });

        expect(modelFactory).toHaveBeenCalledTimes(2);
        expect(modelFactory).toHaveBeenCalledWith('gpt-configured');
    });

    it('passes tool errors the model can fix back to the model', async () => {
        const model = new ScriptedChatModel([
            [{ name: 'read_sheet_range', args: { source_id: 'foreign', range: 'A1:B2' } }],
            [{ name: null, args: { operations: [] } }],
        ]);
        const deps = makeDeps();
        const { agent } = makeAgent(model, undefined, deps);

        await agent.buildMutationPlan(input);

        expect(deps.readRange).not.toHaveBeenCalled();
        expect(JSON.stringify(model.receivedMessages[1])).toContain('SOURCE_NOT_IN_GROUP');
    });

    it('fails the run with the original code when a tool hits an infrastructure error', async () => {
        const model = new ScriptedChatModel([
            [{ name: 'read_sheet_range', args: { source_id: 's1', range: 'A1:B2' } }],
            [{ name: null, args: { operations: [] } }],
        ]);
        const deps = makeDeps();
        deps.readRange.mockRejectedValueOnce(
            new ProgramsSyncError('SOURCE_UNAVAILABLE', 'sheet unavailable'),
        );
        const { agent } = makeAgent(model, undefined, deps);

        await expect(agent.buildMutationPlan(input)).rejects.toMatchObject({
            code: 'SOURCE_UNAVAILABLE',
        });
    });

    it('fails with AGENT_TIMEOUT when the run exceeds the timeout', async () => {
        const model = new ScriptedChatModel([], true);
        const { agent } = makeAgent(model, { timeoutMs: 30 });

        await expect(agent.buildMutationPlan(input)).rejects.toMatchObject({
            code: 'AGENT_TIMEOUT',
            retryable: true,
        });
    });

    it('fails with AGENT_TIMEOUT when the step limit is exceeded', async () => {
        const loop = Array.from({ length: 30 }, () => [{ name: 'list_group_sources', args: {} }]);
        const model = new ScriptedChatModel(loop);
        const { agent } = makeAgent(model, { maxSteps: 4 });

        await expect(agent.buildMutationPlan(input)).rejects.toMatchObject({
            code: 'AGENT_TIMEOUT',
        });
    });

    it('maps provider failures to AGENT_PROVIDER_ERROR', async () => {
        const model = new ScriptedChatModel([]);
        vi.spyOn(model, '_generate').mockRejectedValue(new Error('boom'));
        const { agent } = makeAgent(model);

        await expect(agent.buildMutationPlan(input)).rejects.toMatchObject({
            code: 'AGENT_PROVIDER_ERROR',
            retryable: true,
        });
    });

    it('rejects an update without recordId as invalid workflow data', async () => {
        const model = new ScriptedChatModel([
            [
                {
                    name: null,
                    args: {
                        operations: [
                            {
                                kind: 'update',
                                record_type: 'price',
                                data: {},
                                sources: [{ source_id: 's1', row_numbers: [1] }],
                            },
                        ],
                    },
                },
            ],
        ]);
        const { agent } = makeAgent(model);

        await expect(agent.buildMutationPlan(input)).rejects.toMatchObject({
            code: 'INVALID_WORKFLOW_DATA',
        });
    });
});
