import { randomUUID } from 'node:crypto';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { fakeModel } from '@langchain/core/testing';
import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createAgent } from 'langchain';
import { Client } from 'pg';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AgentCapability } from '../../../shared/agent-capability';
import { ClientProfileRegistry } from '../application/client-profile-registry';
import type { AgentEvent } from '../domain/agent-event';
import { RunInput } from '../domain/run-input';
import { AgentProfileFactory } from './agent-profile-factory';
import { AgentRunner } from './agent-runner';
import { ChatThread, type ThreadCheckpointer } from './chat-thread';

// Спайк E6: форк контекста агента от сохранённого checkpoint_id (design E6).
// Часть на MemorySaver идёт всегда; часть на реальном PostgresSaver нужна PostgreSQL:
// админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL, без него она пропускается.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

/** A specialist that runs as a subgraph of the orchestrator (checkpoint_ns is not empty). */
function specialist(name: string): AgentCapability {
    return {
        name,
        description: `Специалист ${name}`,
        mode: 'fork',
        buildAgent: () =>
            createAgent({ model: fakeModel().respond(new AIMessage('сделано')), tools: [] }),
    };
}

interface Harness {
    ask(question: string, fromCheckpointId?: string): Promise<AgentEvent[]>;
    /** What the orchestrator model received on its last call. */
    lastSeen(): string[];
    factory: AgentProfileFactory;
    thread: ChatThread;
    saver: BaseCheckpointSaver & ThreadCheckpointer;
}

function harness(saver: BaseCheckpointSaver & ThreadCheckpointer, threadId: string): Harness {
    const seen: string[][] = [];
    const record =
        (answer: AIMessage) =>
        (messages: BaseMessage[]): AIMessage => {
            seen.push(messages.map((message) => message.text));
            return answer;
        };
    const delegation = new AIMessage({
        content: '',
        tool_calls: [
            {
                id: 'call-1',
                name: 'task',
                args: { description: 'выполни', subagent_type: 'tasks' },
            },
        ],
    });
    const model = fakeModel()
        .respond(record(delegation)) // turn 1: delegates to the subgraph
        .respond(record(new AIMessage('итог-1')))
        .respond(record(new AIMessage('ответ-2'))) // turn 2: to be thrown away
        .respond(record(new AIMessage('ответ-3'))) // turn 2': the new branch
        .respond(record(new AIMessage('ответ-4')));
    const factory = new AgentProfileFactory({
        registry: new ClientProfileRegistry(),
        sheetsQa: specialist('sheets_qa'),
        tasks: specialist('tasks'),
        meetings: specialist('meetings'),
        vocalAi: specialist('vocal-ai'),
        orchestratorModel: model,
        checkpointer: saver,
    });
    const runner = new AgentRunner({
        agents: { build: (client, ctx) => factory.build(client, ctx) },
        maxSteps: 50,
        timeoutMs: 20_000,
        logger: { setContext: () => undefined, error: () => undefined } as unknown as PinoLogger,
    });
    return {
        async ask(question, fromCheckpointId) {
            const events: AgentEvent[] = [];
            const input = RunInput.of({ threadId, runId: randomUUID(), question });
            for await (const event of runner.stream(input, new AbortController().signal, {
                userId: 'user-1',
                client: 'manager-app',
                ...(fromCheckpointId === undefined ? {} : { fromCheckpointId }),
            })) {
                events.push(event);
            }
            return events;
        },
        lastSeen: () => (seen.at(-1) ?? []).filter((line) => !line.startsWith('system')),
        factory,
        thread: new ChatThread(saver),
        saver,
    };
}

/** The whole scenario of the rewind: two turns, a fork before the second, a system message. */
function forkScenario(createSaver: () => Promise<BaseCheckpointSaver & ThreadCheckpointer>): void {
    it('the agent does not see the deleted turn after a fork', async () => {
        const threadId = randomUUID();
        const h = harness(await createSaver(), threadId);
        await h.ask('вопрос-1');
        const before = await h.thread.latestCheckpointId(threadId);
        expect(before).not.toBeNull();
        await h.ask('вопрос-2');

        const events = await h.ask('новый-вопрос-2', before ?? undefined);

        expect(events.at(-1)?.type).toBe('run-finished');
        expect(h.lastSeen()).toContain('вопрос-1');
        expect(h.lastSeen()).toContain('новый-вопрос-2');
        expect(h.lastSeen()).not.toContain('вопрос-2');
        expect(h.lastSeen()).not.toContain('ответ-2');
    }, 30_000);

    it('getTuple without checkpoint_id returns the new branch', async () => {
        const threadId = randomUUID();
        const h = harness(await createSaver(), threadId);
        await h.ask('вопрос-1');
        const before = await h.thread.latestCheckpointId(threadId);
        await h.ask('вопрос-2');
        await h.ask('новый-вопрос-2', before ?? undefined);

        const head = await h.saver.getTuple({
            configurable: { thread_id: threadId, checkpoint_ns: '' },
        });
        const texts = (head?.checkpoint.channel_values.messages as BaseMessage[]).map(
            (m) => m.text,
        );
        expect(texts).toContain('новый-вопрос-2');
        expect(texts).toContain('ответ-3');
        expect(texts).not.toContain('вопрос-2');
        expect(texts).not.toContain('ответ-2');
        expect(await h.thread.latestCheckpointId(threadId)).toBe(
            head?.config.configurable?.checkpoint_id,
        );
    }, 30_000);

    it('a regular run and a system message after the fork continue the new branch', async () => {
        const threadId = randomUUID();
        const h = harness(await createSaver(), threadId);
        await h.ask('вопрос-1');
        const before = await h.thread.latestCheckpointId(threadId);
        await h.ask('вопрос-2');
        await h.ask('новый-вопрос-2', before ?? undefined);

        await h.factory.appendAssistantMessage(threadId, 'Расшифровка готова');
        await h.ask('вопрос-3');

        expect(h.lastSeen()).toContain('новый-вопрос-2');
        expect(h.lastSeen()).toContain('Расшифровка готова');
        expect(h.lastSeen()).toContain('вопрос-3');
        expect(h.lastSeen()).not.toContain('вопрос-2');
        expect(h.lastSeen()).not.toContain('ответ-2');
    }, 30_000);

    it('subgraph checkpoints (checkpoint_ns is not empty) survive the fork', async () => {
        const threadId = randomUUID();
        const h = harness(await createSaver(), threadId);
        const first = await h.ask('вопрос-1');
        expect(first.some((event) => event.type === 'tool-call-started')).toBe(true);
        const before = await h.thread.latestCheckpointId(threadId);
        await h.ask('вопрос-2');

        const events = await h.ask('новый-вопрос-2', before ?? undefined);

        expect(events.at(-1)?.type).toBe('run-finished');
        // Turn 1 is still in the context together with the delegation to the specialist.
        const head = await h.saver.getTuple({
            configurable: { thread_id: threadId, checkpoint_ns: '' },
        });
        const texts = (head?.checkpoint.channel_values.messages as BaseMessage[]).map(
            (m) => m.text,
        );
        expect(texts).toContain('итог-1');
    }, 30_000);

    it('the first turn has no checkpoint before it: latestCheckpointId is null', async () => {
        const h = harness(await createSaver(), randomUUID());
        await expect(h.thread.latestCheckpointId(randomUUID())).resolves.toBeNull();
    });
}

describe('checkpoint fork (MemorySaver)', () => {
    forkScenario(() => Promise.resolve(new MemorySaver()));
});

describe.skipIf(adminUrl === undefined)('checkpoint fork (PostgresSaver)', () => {
    const dbName = `chat_fork_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const savers: PostgresSaver[] = [];
    let dbUrl = '';

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        dbUrl = withDatabase(adminUrl ?? '', dbName);
    }, 60_000);

    afterAll(async () => {
        await Promise.all(savers.map((saver) => saver.end()));
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    forkScenario(async () => {
        const saver = PostgresSaver.fromConnString(dbUrl);
        await saver.setup();
        savers.push(saver);
        return saver;
    });
});
