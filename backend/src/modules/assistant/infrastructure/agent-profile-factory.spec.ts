import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
    AgentRunContext,
    type AgentCapability,
    type AgentCapabilityMode,
    type CapabilityAgent,
} from '../../../shared/agent-capability';
import { ClientProfileRegistry, UnknownClientError } from '../application/client-profile-registry';
import type { ClientId } from '../domain/client-id';

const createDeepAgent = vi.hoisted(() => vi.fn());

vi.mock('deepagents', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createDeepAgent,
}));

import { AgentProfileFactory } from './agent-profile-factory';
import { buildOrchestratorPrompt } from './orchestrator-prompt';

interface DeepAgentOptions {
    model: unknown;
    checkpointer: unknown;
    systemPrompt: string;
    tools?: unknown[];
    subagents: { name: string; description: string; runnable: unknown; mode?: string }[];
}

const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });
const checkpointer = {} as BaseCheckpointSaver;
const orchestratorModel = { name: 'orchestrator' } as unknown as BaseChatModel;

interface FakeCapability extends AgentCapability {
    readonly buildAgent: Mock<AgentCapability['buildAgent']>;
    readonly built: CapabilityAgent;
}

function capability(name: string, mode: AgentCapabilityMode): FakeCapability {
    const built = { name: `${name}-agent` } as unknown as CapabilityAgent;
    return {
        name,
        description: `Описание ${name}`,
        mode,
        built,
        buildAgent: vi.fn<AgentCapability['buildAgent']>(() => built),
    };
}

describe('AgentProfileFactory', () => {
    const sheetsQa = capability('sheets_qa', 'isolated');
    const tasks = capability('tasks', 'fork');
    const topLevelAgent = { name: 'orchestrator-agent' };

    function create(registry = new ClientProfileRegistry()): AgentProfileFactory {
        return new AgentProfileFactory({
            registry,
            sheetsQa,
            tasks,
            orchestratorModel,
            checkpointer,
        });
    }

    beforeEach(() => {
        createDeepAgent.mockReset();
        createDeepAgent.mockReturnValue(topLevelAgent);
        sheetsQa.buildAgent.mockClear();
        tasks.buildAgent.mockClear();
    });

    describe.each<ClientId>(['manager-app', 'employee-app'])(
        'client %s (profile app)',
        (client) => {
            it('builds an orchestrator deep agent with its own checkpointer and the orchestrator model', () => {
                const agent = create().build(client, ctx);

                expect(agent).toBe(topLevelAgent);
                expect(createDeepAgent).toHaveBeenCalledTimes(1);
                const options = createDeepAgent.mock.calls[0][0] as DeepAgentOptions;
                expect(options.model).toBe(orchestratorModel);
                expect(options.checkpointer).toBe(checkpointer);
                expect(options.systemPrompt).toBe(buildOrchestratorPrompt([sheetsQa, tasks]));
                expect(options.tools ?? []).toEqual([]);
            });

            it('wires sheets_qa as isolated and tasks as fork subagents', () => {
                create().build(client, ctx);

                const { subagents } = createDeepAgent.mock.calls[0][0] as DeepAgentOptions;
                expect(subagents).toEqual([
                    {
                        name: 'sheets_qa',
                        description: sheetsQa.description,
                        runnable: sheetsQa.built,
                        mode: 'isolated',
                    },
                    {
                        name: 'tasks',
                        description: tasks.description,
                        runnable: tasks.built,
                        mode: 'fork',
                    },
                ]);
            });

            it('builds the capabilities for the run context without a checkpointer', () => {
                create().build(client, ctx);

                expect(sheetsQa.buildAgent).toHaveBeenCalledWith(ctx);
                expect(tasks.buildAgent).toHaveBeenCalledWith(ctx);
            });
        },
    );

    describe('client telegram (profile telegram)', () => {
        it('returns the tasks capability agent built with the checkpointer', () => {
            const agent = create().build('telegram', ctx);

            expect(agent).toBe(tasks.built);
            expect(tasks.buildAgent).toHaveBeenCalledWith(ctx, { checkpointer });
        });

        it('has no subagents and no price tools', () => {
            create().build('telegram', ctx);

            expect(createDeepAgent).not.toHaveBeenCalled();
            expect(sheetsQa.buildAgent).not.toHaveBeenCalled();
        });
    });

    it('uses the same tasks capability in both profiles', () => {
        const factory = create();
        factory.build('manager-app', ctx);
        factory.build('telegram', ctx);

        expect(tasks.buildAgent).toHaveBeenCalledTimes(2);
    });

    it('rejects an unknown client before building anything', () => {
        expect(() => create().build('unknown' as ClientId, ctx)).toThrow(UnknownClientError);
        expect(createDeepAgent).not.toHaveBeenCalled();
        expect(sheetsQa.buildAgent).not.toHaveBeenCalled();
        expect(tasks.buildAgent).not.toHaveBeenCalled();
    });

    it('follows the registry when a client gets its own profile', () => {
        const registry = new ClientProfileRegistry({ 'employee-app': 'telegram' });
        const agent = create(registry).build('employee-app', ctx);

        expect(agent).toBe(tasks.built);
    });
});

describe('buildOrchestratorPrompt', () => {
    it('is in Russian, routes by capability descriptions and bans answering from memory', () => {
        const prompt = buildOrchestratorPrompt([
            capability('sheets_qa', 'isolated'),
            capability('tasks', 'fork'),
        ]);

        expect(prompt).toMatch(/[а-я]/i);
        expect(prompt).toContain('sheets_qa');
        expect(prompt).toContain('Описание sheets_qa');
        expect(prompt).toContain('tasks');
        expect(prompt).toContain('Описание tasks');
    });
});
