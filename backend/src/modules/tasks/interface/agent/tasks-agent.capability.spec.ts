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
import { TasksAgentCapability } from './tasks-agent.capability';

const model = { name: 'fake-model' } as unknown as BaseChatModel;
const createTaskExecute = vi.fn();
const deps = {
    createTask: { execute: createTaskExecute },
    listTasks: { execute: vi.fn() },
    updateTask: { execute: vi.fn() },
    users: { findActiveByIds: vi.fn(), searchActive: vi.fn() },
} as unknown as TaskToolsDeps;
const ctx = AgentRunContext.create({ userId: 'u-1', threadId: 't-1' });

beforeEach(() => {
    createAgent.mockReset();
    createAgent.mockReturnValue({ invoke: vi.fn() });
});

describe('TasksAgentCapability', () => {
    const capability = new TasksAgentCapability(deps, model);

    it('is named tasks, forks the caller context and describes when to pick it', () => {
        expect(capability.name).toBe('tasks');
        expect(capability.mode).toBe('fork');
        expect(capability.description).toMatch(/задач/i);
        expect(capability.description.length).toBeGreaterThan(20);
    });

    it('builds an agent with exactly the four task tools', () => {
        capability.buildAgent(ctx);

        expect(createAgent).toHaveBeenCalledTimes(1);
        const options = createAgent.mock.calls[0][0] as {
            tools: { name: string }[];
            model: unknown;
        };
        expect(options.tools.map((tool) => tool.name).sort()).toEqual([
            'create_task',
            'find_users',
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
        createTaskExecute.mockRejectedValue(new Error('stop'));
        capability.buildAgent(ctx);
        const { tools } = createAgent.mock.calls[0][0] as {
            tools: { name: string; invoke(input: unknown): Promise<unknown> }[];
        };
        const create = tools.find((tool) => tool.name === 'create_task');

        await expect(create?.invoke({ title: 'X' })).rejects.toThrow();

        expect(createTaskExecute).toHaveBeenCalledWith(
            expect.objectContaining({ userId: 'u-1' }),
            expect.anything(),
        );
    });

    it('gives the agent no delete or attachment tools', () => {
        capability.buildAgent(ctx);

        const { tools } = createAgent.mock.calls[0][0] as { tools: { name: string }[] };
        expect(tools.map((tool) => tool.name).join(' ')).not.toMatch(/delete|attach/i);
    });

    it('uses the tasks prompt as the system prompt', () => {
        capability.buildAgent(ctx);

        expect((createAgent.mock.calls[0][0] as { systemPrompt: string }).systemPrompt).toBe(
            buildTasksAgentPrompt(),
        );
    });
});

describe('tasks agent prompt', () => {
    const prompt = buildTasksAgentPrompt();

    it('is in Russian and requires asking for missing required data', () => {
        expect(prompt).toMatch(/уточн|спроси|запроси/i);
        expect(prompt).toMatch(/заголовок/i);
        expect(prompt).toMatch(/не придумывай/i);
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
