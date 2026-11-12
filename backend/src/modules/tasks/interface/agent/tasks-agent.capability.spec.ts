import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunContext } from '../../../../shared/agent-capability';
import type { TaskToolsDeps } from './task-tools';

const createAgent = vi.hoisted(() => vi.fn());

vi.mock('langchain', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    createAgent,
}));

import { TASKS_AGENT_OFF_TOPIC_REPLY, buildTasksAgentPrompt } from './tasks-agent-prompt';
import { TASKS_AGENT_SKILLS_DIR } from './tasks-agent-skills';
import { TasksAgentCapability } from './tasks-agent.capability';

const model = { name: 'fake-model' } as unknown as BaseChatModel;
const proposeTasksExecute = vi.fn();
const deps = {
    proposeTasks: { execute: proposeTasksExecute },
    createTasksFromDraft: { execute: vi.fn() },
    getTask: { execute: vi.fn() },
    listTasks: { execute: vi.fn() },
    updateTask: { execute: vi.fn() },
    users: { findActiveByIds: vi.fn(), searchActive: vi.fn() },
} as unknown as TaskToolsDeps;
const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });
const NOW = new Date('2026-11-11T09:00:00.000Z');
const clock = { now: vi.fn(() => NOW) };

beforeEach(() => {
    createAgent.mockReset();
    createAgent.mockReturnValue({ invoke: vi.fn() });
    clock.now.mockClear();
    clock.now.mockImplementation(() => NOW);
});

describe('TasksAgentCapability', () => {
    const capability = new TasksAgentCapability(deps, model, clock, TASKS_AGENT_SKILLS_DIR);

    it('is named tasks, forks the caller context and describes when to pick it', () => {
        expect(capability.name).toBe('tasks');
        expect(capability.mode).toBe('fork');
        expect(capability.description).toMatch(/задач/i);
        expect(capability.description.length).toBeGreaterThan(20);
    });

    it('builds an agent with exactly the five task tools', () => {
        capability.buildAgent(ctx);

        expect(createAgent).toHaveBeenCalledTimes(1);
        const options = createAgent.mock.calls[0][0] as {
            tools: { name: string }[];
            model: unknown;
        };
        expect(options.tools.map((tool) => tool.name).sort()).toEqual([
            'create_tasks',
            'find_users',
            'propose_tasks',
            'search_tasks',
            'update_task',
        ]);
        expect(options.model).toBe(model);
    });

    it('returns the agent created by createAgent', () => {
        const agent = { invoke: vi.fn() };
        createAgent.mockReturnValue(agent);

        expect(capability.buildAgent(ctx)).toBe(agent);
    });

    it('passes the checkpointer when given and omits it otherwise', () => {
        const checkpointer = {} as BaseCheckpointSaver;

        capability.buildAgent(ctx, { checkpointer });
        capability.buildAgent(ctx);

        expect((createAgent.mock.calls[0][0] as { checkpointer?: unknown }).checkpointer).toBe(
            checkpointer,
        );
        expect(createAgent.mock.calls[1][0]).not.toHaveProperty('checkpointer');
    });

    it('binds the tools to the user of the run context', async () => {
        proposeTasksExecute.mockRejectedValue(new Error('stop'));
        capability.buildAgent(ctx);
        const { tools } = createAgent.mock.calls[0][0] as {
            tools: { name: string; invoke(input: unknown): Promise<unknown> }[];
        };
        const propose = tools.find((tool) => tool.name === 'propose_tasks');

        await expect(propose?.invoke({ items: [{ title: 'X' }] })).rejects.toThrow();

        expect(proposeTasksExecute).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'u-1' }),
            expect.objectContaining({ threadId: 't-1' }),
        );
    });

    it('gives the agent no delete or attachment tools', () => {
        capability.buildAgent(ctx);

        const { tools } = createAgent.mock.calls[0][0] as { tools: { name: string }[] };
        expect(tools.map((tool) => tool.name).join(' ')).not.toMatch(/delete|attach/i);
    });

    it('uses the tasks prompt built for the current clock time as the system prompt', () => {
        capability.buildAgent(ctx);

        expect((createAgent.mock.calls[0][0] as { systemPrompt: string }).systemPrompt).toBe(
            buildTasksAgentPrompt(NOW),
        );
    });

    it('takes now from the clock on every buildAgent call', () => {
        const later = new Date('2026-11-13T20:00:00.000Z');
        clock.now.mockReturnValueOnce(NOW).mockReturnValueOnce(later);

        capability.buildAgent(ctx);
        capability.buildAgent(ctx);

        expect(clock.now).toHaveBeenCalledTimes(2);
        const prompts = createAgent.mock.calls.map(
            (call) => (call[0] as { systemPrompt: string }).systemPrompt,
        );
        expect(prompts[0]).toBe(buildTasksAgentPrompt(NOW));
        expect(prompts[1]).toBe(buildTasksAgentPrompt(later));
        expect(prompts[1]).toContain('пятница');
    });

    it('wires the skills read-only: skills middleware plus read_file and no write tools', () => {
        capability.buildAgent(ctx);

        const { middleware } = createAgent.mock.calls[0][0] as {
            middleware?: { name: string; tools?: { name: string }[] }[];
        };
        expect(middleware?.map((item) => item.name)).toEqual(
            expect.arrayContaining(['SkillsMiddleware', 'FilesystemMiddleware']),
        );
        const middlewareTools = (middleware ?? []).flatMap((item) =>
            (item.tools ?? []).map((tool) => tool.name),
        );
        expect(middlewareTools).toEqual(['read_file']);
    });
});

describe('tasks agent prompt', () => {
    const prompt = buildTasksAgentPrompt(NOW);

    it('is in Russian and forbids inventing values', () => {
        expect(prompt).toMatch(/уточн|спроси|запроси/i);
        expect(prompt).toMatch(/не придумывай/i);
    });

    it('sends task creation to the task-creation skill instead of creating right away', () => {
        expect(prompt).toContain('task-creation');
        expect(prompt).toMatch(/прежде чем создавать задачу, следуй скиллу task-creation/i);
        expect(prompt).not.toMatch(/как только есть заголовок/i);
    });

    it('creates tasks only through propose_tasks and create_tasks, never through create_task', () => {
        expect(prompt).toContain('propose_tasks');
        expect(prompt).toContain('create_tasks');
        expect(prompt).not.toMatch(/\bcreate_task\b/);
        expect(prompt).toMatch(/без (карточ|списк)[^.]*подтвержден/i);
    });

    it('allows naming another creator but keeps the run user as the initiator', () => {
        expect(prompt).toMatch(/постановщик/i);
        expect(prompt).toMatch(/от имени/i);
        expect(prompt).toMatch(/инициатор/i);
    });

    it('passes the meeting origin to propose_tasks for a list from a meeting', () => {
        expect(prompt).toMatch(/origin/);
        expect(prompt).toMatch(/встреч/i);
    });

    it('requires clarifying ambiguous tasks and users instead of choosing', () => {
        expect(prompt).toMatch(/несколько задач/i);
        expect(prompt).toMatch(/несколько пользователей/i);
        expect(prompt).toContain('search_tasks');
        expect(prompt).toContain('update_task');
        expect(prompt).toContain('find_users');
    });

    it('limits the agent to tasks and fixes the off-topic reply', () => {
        expect(prompt).toMatch(/только с задачами/i);
        expect(prompt).toContain(TASKS_AGENT_OFF_TOPIC_REPLY);
        expect(TASKS_AGENT_OFF_TOPIC_REPLY.length).toBeGreaterThan(10);
    });

    it('declines deleting tasks and changing attachments', () => {
        expect(prompt).toMatch(/удал/i);
        expect(prompt).toMatch(/вложени/i);
        expect(prompt).toMatch(/в приложении/i);
    });

    it('requires naming the task and the change in the answer, and never claiming success on failure', () => {
        expect(prompt).toMatch(/назови задачу|называй задачу/i);
        expect(prompt).toMatch(/не сообщай, что/i);
    });
});
