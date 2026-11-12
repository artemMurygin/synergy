import { randomUUID } from 'node:crypto';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createAgent } from 'langchain';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    AgentRunContext,
    type AgentCapability,
    type CapabilityAgent,
} from '../../../shared/agent-capability';
import { ClientProfileRegistry } from '../application/client-profile-registry';
import { AgentProfileFactory } from './agent-profile-factory';

// Интеграционный тест: нужна PostgreSQL. Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

function capability(name: string): AgentCapability {
    return {
        name,
        description: `Специалист ${name}`,
        mode: 'isolated',
        buildAgent: (): CapabilityAgent =>
            createAgent({ model: fakeModel().respond(new AIMessage('—')), tools: [] }),
    };
}

interface InvokableAgent {
    invoke(
        input: { messages: { role: string; content: string }[] },
        config: { configurable: Record<string, string> },
    ): Promise<unknown>;
}

describe.skipIf(adminUrl === undefined)('AgentProfileFactory.appendAssistantMessage', () => {
    const dbName = `chat_append_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let saver: PostgresSaver;

    /** Texts the orchestrator model received on each call. */
    let seen: string[][] = [];

    function factory(answers: string[]): AgentProfileFactory {
        let model = fakeModel();
        for (const answer of answers) {
            model = model.respond((messages: BaseMessage[]) => {
                seen.push(messages.map((message) => `${message.type}:${message.text}`));
                return new AIMessage(answer);
            });
        }
        return new AgentProfileFactory({
            registry: new ClientProfileRegistry(),
            sheetsQa: capability('sheets_qa'),
            tasks: capability('tasks'),
            meetings: capability('meetings'),
            orchestratorModel: model,
            checkpointer: saver,
        });
    }

    async function ask(
        agents: AgentProfileFactory,
        threadId: string,
        question: string,
    ): Promise<void> {
        const ctx = AgentRunContext.create({ userId: 'user-1', threadId });
        const agent = agents.build('manager-app', ctx) as unknown as InvokableAgent;
        await agent.invoke(
            { messages: [{ role: 'user', content: question }] },
            { configurable: { thread_id: threadId } },
        );
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        saver = PostgresSaver.fromConnString(withDatabase(adminUrl ?? '', dbName));
        await saver.setup();
    }, 60_000);

    afterAll(async () => {
        await saver.end();
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('the next run sees the appended message after the previous exchange', async () => {
        seen = [];
        const threadId = randomUUID();
        await ask(factory(['Запустил расшифровку']), threadId, 'Расшифруй запись');

        await factory([]).appendAssistantMessage(threadId, 'Расшифровка готова: 2 спикера');

        await ask(factory(['Спикер 1 — Анна']), threadId, 'Кто говорил?');
        const history = (seen.at(-1) ?? []).filter((line) => !line.startsWith('system:'));
        expect(history).toEqual([
            'human:Расшифруй запись',
            'ai:Запустил расшифровку',
            'ai:Расшифровка готова: 2 спикера',
            'human:Кто говорил?',
        ]);
    }, 30_000);

    it('works for a thread without a previous run', async () => {
        seen = [];
        const threadId = randomUUID();
        await factory([]).appendAssistantMessage(threadId, 'Расшифровка не удалась');

        await ask(factory(['Повторю']), threadId, 'Попробуй ещё раз');
        const history = (seen.at(-1) ?? []).filter((line) => !line.startsWith('system:'));
        expect(history).toEqual(['ai:Расшифровка не удалась', 'human:Попробуй ещё раз']);
    }, 30_000);
});
