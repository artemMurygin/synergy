import { AIMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { MemorySaver } from '@langchain/langgraph';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { createAgent, tool } from 'langchain';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentCapability } from '../../../shared/agent-capability';
import type { AgentRunContext } from '../../../shared/agent-capability';
import { TASKS_AGENT_SKILLS_DIR } from '../../tasks/interface/agent/tasks-agent-skills';
import { TasksAgentCapability } from '../../tasks/interface/agent/tasks-agent.capability';
import type { TaskToolsDeps } from '../../tasks/interface/agent/task-tools';
import { ClientProfileRegistry } from '../application/client-profile-registry';
import { AgentEvent, RUN_FAILED_PUBLIC_MESSAGE } from '../domain/agent-event';
import type { AgentRunScope } from '../domain/ports/agent-runner.port';
import { RunInput } from '../domain/run-input';
import { AgentProfileFactory } from './agent-profile-factory';
import { AgentRunner, type AgentFactory, type AgentRunnerOptions } from './agent-runner';

const input = (threadId = 'thread-1'): RunInput =>
    RunInput.of({ threadId, runId: 'run-1', question: 'Что по задачам?' });

const scope: AgentRunScope = { userId: 'user-7', client: 'manager-app' };

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    for await (const event of stream) events.push(event);
    return events;
}

/** Model that never answers on its own; only an abort ends the run. */
function hangingModel(): FakeListChatModel {
    return new FakeListChatModel({ responses: ['поздно'], sleep: 60_000 });
}

const logger = { setContext: vi.fn(), error: vi.fn() };

const noopTool = tool(() => 'ok', {
    name: 'noop',
    description: 'Does nothing',
    schema: z.object({}).loose(),
});

function simpleAgents(
    model: ReturnType<typeof fakeModel> | FakeListChatModel,
    tools: StructuredToolInterface[] = [],
): AgentFactory {
    return {
        build: () => createAgent({ model, tools, checkpointer: new MemorySaver() }),
    };
}

function create(
    agents: AgentFactory,
    overrides: Partial<Pick<AgentRunnerOptions, 'maxSteps' | 'timeoutMs'>> = {},
): AgentRunner {
    return new AgentRunner({
        agents,
        maxSteps: overrides.maxSteps ?? 50,
        timeoutMs: overrides.timeoutMs ?? 20_000,
        logger: logger as unknown as PinoLogger,
    });
}

describe('AgentRunner.stream', () => {
    it('starts with run-started and ends a successful run with run-finished carrying the answer', async () => {
        const model = new FakeListChatModel({ responses: ['Задач нет.'] });
        const events = await collect(
            create(simpleAgents(model)).stream(input(), new AbortController().signal, scope),
        );

        expect(events[0]).toEqual(AgentEvent.runStarted());
        const last = events.at(-1);
        expect(last?.type).toBe('run-finished');
        if (last?.type !== 'run-finished') return;
        expect(last.answer).toBe('Задач нет.');
        expect(events.filter(AgentEvent.isTerminal)).toHaveLength(1);
    });

    it('builds the agent on every run from the run scope', async () => {
        const agents = simpleAgents(new FakeListChatModel({ responses: ['ок', 'ок'] }));
        const build = vi.fn<AgentFactory['build']>((client, ctx) => agents.build(client, ctx));
        const runner = create({ build });

        await collect(runner.stream(input('t-a'), new AbortController().signal, scope));
        await collect(
            runner.stream(input('t-b'), new AbortController().signal, {
                userId: 'user-8',
                client: 'telegram',
            }),
        );

        expect(build).toHaveBeenCalledTimes(2);
        const [firstClient, firstCtx] = build.mock.calls[0] as [string, AgentRunContext];
        expect(firstClient).toBe('manager-app');
        expect(firstCtx).toMatchObject({ userId: 'user-7', threadId: 't-a' });
        const [secondClient, secondCtx] = build.mock.calls[1] as [string, AgentRunContext];
        expect(secondClient).toBe('telegram');
        expect(secondCtx).toMatchObject({ userId: 'user-8', threadId: 't-b' });
    });

    it('uses the threadId as the checkpoint thread_id and puts userId into configurable', async () => {
        const checkpointer = new MemorySaver();
        const seen: unknown[] = [];
        const agents: AgentFactory = {
            build: () =>
                createAgent({
                    model: new FakeListChatModel({ responses: ['ответ'] }),
                    tools: [],
                    checkpointer,
                    middleware: [],
                }),
        };
        const runner = create(agents);
        const original = checkpointer.put.bind(checkpointer);
        checkpointer.put = (config, ...rest) => {
            seen.push(config.configurable);
            return original(config, ...rest);
        };

        await collect(runner.stream(input('thread-xyz'), new AbortController().signal, scope));

        expect(seen.length).toBeGreaterThan(0);
        expect(seen[0]).toMatchObject({ thread_id: 'thread-xyz', userId: 'user-7' });
        const tuple = await checkpointer.getTuple({ configurable: { thread_id: 'thread-xyz' } });
        expect(tuple).toBeDefined();
        const other = await checkpointer.getTuple({ configurable: { thread_id: 'run-1' } });
        expect(other).toBeUndefined();
    });

    it('turns a model error into run-failed without the internal error text', async () => {
        const model = fakeModel().alwaysThrow(new Error('модель недоступна'));
        const events = await collect(
            create(simpleAgents(model)).stream(input(), new AbortController().signal, scope),
        );

        const last = events.at(-1);
        expect(last?.type).toBe('run-failed');
        if (last?.type !== 'run-failed') return;
        expect(last.message).toBe(RUN_FAILED_PUBLIC_MESSAGE);
        expect(last.message).not.toContain('модель недоступна');
        expect(logger.error).toHaveBeenCalled();
    });

    it('turns a failure to build the agent into run-failed', async () => {
        const agents: AgentFactory = {
            build: () => {
                throw new Error('нет профиля');
            },
        };
        const events = await collect(
            create(agents).stream(input(), new AbortController().signal, scope),
        );

        expect(events.at(-1)).toEqual(AgentEvent.runFailed(RUN_FAILED_PUBLIC_MESSAGE));
    });

    it('stops with run-cancelled when the signal is aborted', async () => {
        const controller = new AbortController();
        const pending = collect(
            create(simpleAgents(hangingModel())).stream(input(), controller.signal, scope),
        );
        setTimeout(() => {
            controller.abort();
        }, 100);

        const events = await pending;
        expect(events.at(-1)).toEqual(AgentEvent.runCancelled());
        expect(events.filter(AgentEvent.isTerminal)).toHaveLength(1);
    }, 10_000);

    it('fails with a time-exceeded message on timeout', async () => {
        const events = await collect(
            create(simpleAgents(hangingModel()), { timeoutMs: 150 }).stream(
                input(),
                new AbortController().signal,
                scope,
            ),
        );

        const last = events.at(-1);
        expect(last?.type).toBe('run-failed');
        if (last?.type !== 'run-failed') return;
        expect(last.message).toMatch(/врем/i);
    }, 10_000);

    it('fails with run-failed when recursionLimit is exceeded', async () => {
        // Every queued answer calls the tool again, so the run can only end on the step limit.
        let model = fakeModel();
        for (let i = 0; i < 20; i++) {
            model = model.respond(
                new AIMessage({
                    content: '',
                    tool_calls: [{ id: `c-${String(i)}`, name: 'noop', args: {} }],
                }),
            );
        }
        const events = await collect(
            create(simpleAgents(model, [noopTool]), { maxSteps: 5 }).stream(
                input(),
                new AbortController().signal,
                scope,
            ),
        );

        const last = events.at(-1);
        expect(last?.type).toBe('run-failed');
        if (last?.type !== 'run-failed') return;
        expect(last.message).toMatch(/лимит/i);
    }, 20_000);

    it('records tool calls of the run in the final event', async () => {
        const model = fakeModel()
            .respond(
                new AIMessage({
                    content: '',
                    tool_calls: [{ id: 'call-1', name: 'noop', args: { q: 1 } }],
                }),
            )
            .respond(new AIMessage('готово'));
        const events = await collect(
            create(simpleAgents(model, [noopTool])).stream(
                input(),
                new AbortController().signal,
                scope,
            ),
        );

        const last = events.at(-1);
        expect(last?.type).toBe('run-finished');
        if (last?.type !== 'run-finished') return;
        expect(last.toolCalls).toEqual([{ name: 'noop', args: { q: 1 } }]);
        expect(events.map((e) => e.type)).toContain('tool-call-started');
    });
});

describe('AgentRunner: userId reaches a subagent tool (design D4)', () => {
    it('passes the run user to the tool of a forked subagent and traces nested calls', async () => {
        const createTask = vi.fn(() =>
            Promise.resolve({
                id: 'task-1',
                title: 'Позвонить клиенту',
                description: null,
                status: 'todo',
                deadline: null,
                creator: { id: 'user-7', login: 'ivanov' },
                assignee: null,
                watchers: [],
            }),
        );
        const deps = {
            createTask: { execute: createTask },
            listTasks: { execute: vi.fn() },
            updateTask: { execute: vi.fn() },
            users: { findActiveByIds: vi.fn(), searchActive: vi.fn() },
        } as unknown as TaskToolsDeps;

        const subagentModel = fakeModel()
            .respond(
                new AIMessage({
                    content: '',
                    tool_calls: [
                        {
                            id: 'sub-call-1',
                            name: 'create_task',
                            args: { title: 'Позвонить клиенту' },
                        },
                    ],
                }),
            )
            .respond(new AIMessage('Задача создана'));
        const tasks = new TasksAgentCapability(
            deps,
            subagentModel,
            { now: () => new Date('2026-11-11T09:00:00.000Z') },
            TASKS_AGENT_SKILLS_DIR,
        );
        const sheetsQa: AgentCapability = {
            name: 'sheets_qa',
            description: 'Цены',
            mode: 'isolated',
            buildAgent: () => createAgent({ model: fakeModel(), tools: [] }),
        };
        const orchestratorModel = fakeModel()
            .respond(
                new AIMessage({
                    content: '',
                    tool_calls: [
                        {
                            id: 'task-call-1',
                            name: 'task',
                            args: { description: 'Поставь задачу', subagent_type: 'tasks' },
                        },
                    ],
                }),
            )
            .respond(new AIMessage('Поставил задачу'));
        const profiles = new AgentProfileFactory({
            registry: new ClientProfileRegistry(),
            sheetsQa,
            tasks,
            orchestratorModel,
            checkpointer: new MemorySaver(),
        });

        const events = await collect(
            create(profiles).stream(input(), new AbortController().signal, scope),
        );

        expect(createTask).toHaveBeenCalledTimes(1);
        expect(createTask.mock.calls[0] as unknown[]).toEqual([
            expect.objectContaining({ userId: 'user-7' }),
            expect.objectContaining({ title: 'Позвонить клиенту' }),
        ]);
        const last = events.at(-1);
        expect(last?.type).toBe('run-finished');
        if (last?.type !== 'run-finished') return;
        expect(last.toolCalls.map((call) => call.name)).toEqual(['task', 'create_task']);
    }, 20_000);
});
