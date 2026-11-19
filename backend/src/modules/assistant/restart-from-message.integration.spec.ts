import { randomUUID } from 'node:crypto';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatGenerationChunk } from '@langchain/core/outputs';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { MemorySaver, type BaseCheckpointSaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createAgent } from 'langchain';
import type { PinoLogger } from 'nestjs-pino';
import { Client } from 'pg';
import { createPool, type DatabasePool } from 'slonik';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { migrate } from '../../database/postgres/migrator';
import { TransactionRunner } from '../../database/postgres/transaction-runner';
import { StartAgentRunUseCase, type RunObserver } from './application/start-agent-run.use-case';
import { type AgentEvent } from './domain/agent-event';
import { ChatSession } from './domain/chat-session';
import { AttachmentFilesPort } from './domain/ports/attachment-files.port';
import { type ChatSessionRepositoryPort } from './domain/ports/chat-session-repository.port';
import { RunConflictError } from './domain/run-conflict.error';
import { ActiveRunRegistry } from './infrastructure/active-run-registry';
import { AgentRunner } from './infrastructure/agent-runner';
import { ChatSessionRepository } from './infrastructure/chat-session-repository';
import { ChatThread, type ThreadCheckpointer } from './infrastructure/chat-thread';
import { InMemoryChatSessionRepository } from './interface/http/testing/in-memory-chat-session-repository';

// Сквозной сценарий перезапуска ответа с сообщения: настоящие репозиторий и checkpointer,
// агент на фейковой модели. Часть на памяти (InMemory + MemorySaver) идёт всегда; часть на
// реальном Postgres нужна PostgreSQL: админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

interface Stores {
    repo: ChatSessionRepositoryPort;
    saver: BaseCheckpointSaver & ThreadCheckpointer;
    ownerId: string;
}

/** One step of the model script: the text of the answer or an error. */
type Step = string | Error;

/** Streams scripted answers (the agent takes the answer text from the stream) and records what it was shown. */
class ScriptedModel extends FakeListChatModel {
    readonly seen: string[][] = [];
    private next = 0;

    constructor(private readonly script: readonly Step[]) {
        super({ responses: [''] });
    }

    /** The agent binds tools to the model; the bound copy would lose the script, so bind nothing. */
    override bindTools(): ReturnType<FakeListChatModel['bindTools']> {
        return this;
    }

    override async *_streamResponseChunks(
        messages: BaseMessage[],
        options: this['ParsedCallOptions'],
        runManager?: CallbackManagerForLLMRun,
    ): AsyncGenerator<ChatGenerationChunk> {
        this.seen.push(messages.map((message) => message.text));
        const step = this.script[this.next++] ?? 'ответ по умолчанию';
        if (step instanceof Error) throw step;
        this.responses = [step];
        this.i = 0;
        yield* super._streamResponseChunks(messages, options, runManager);
    }
}

class NoFiles extends AttachmentFilesPort {
    findOwned(): Promise<never[]> {
        return Promise.resolve([]);
    }
}

/** A chat on top of the given stores; the model answers from a script and records what it saw. */
interface World {
    session: ChatSession;
    registry: ActiveRunRegistry;
    run(
        question: string,
        replaceFromMessageId?: string,
    ): Promise<{ events: AgentEvent[]; savedId: string | undefined }>;
    history(): Promise<string[]>;
    lastSeen(): string[];
}

async function createWorld(stores: Stores, script: Step[]): Promise<World> {
    const model = new ScriptedModel(script);
    const registry = new ActiveRunRegistry();
    const logger = { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
    const runner = new AgentRunner({
        agents: { build: () => createAgent({ model, tools: [], checkpointer: stores.saver }) },
        maxSteps: 50,
        timeoutMs: 20_000,
        logger,
    });
    const useCase = new StartAgentRunUseCase(
        runner,
        stores.repo,
        new ChatThread(stores.saver),
        registry,
        new NoFiles(),
        logger,
    );
    const session = await stores.repo.create(
        ChatSession.create({ ownerId: stores.ownerId, channel: 'app' }),
    );

    /** Starts a run and waits for the end of the stream. */
    async function run(
        question: string,
        replaceFromMessageId?: string,
    ): Promise<{ events: AgentEvent[]; savedId: string | undefined }> {
        const events: AgentEvent[] = [];
        let close: () => void = () => undefined;
        const closed = new Promise<void>((resolve) => {
            close = resolve;
        });
        const observer: RunObserver = { next: (event) => events.push(event), close };
        await useCase.execute(
            stores.ownerId,
            {
                threadId: session.id,
                runId: randomUUID(),
                question,
                ...(replaceFromMessageId === undefined ? {} : { replaceFromMessageId }),
            },
            observer,
        );
        await closed;
        const saved = events.find((event) => event.type === 'user-message-saved');
        return {
            events,
            savedId: saved?.type === 'user-message-saved' ? saved.messageId : undefined,
        };
    }

    const history = async (): Promise<string[]> =>
        (await stores.repo.listMessages(session.id, stores.ownerId)).map((m) => m.text);

    return {
        session,
        registry,
        run,
        history,
        lastSeen: (): string[] =>
            (model.seen.at(-1) ?? []).filter((text) => !text.startsWith('system')),
    };
}

const answer = (text: string): Step => text;

function scenarios(makeStores: () => Promise<Stores>): void {
    it('editing the first of two pairs leaves the new question and the new answer; the agent does not see the deleted', async () => {
        const world = await createWorld(await makeStores(), [
            answer('ответ-1'),
            answer('ответ-2'),
            answer('новый-ответ-1'),
        ]);
        const first = await world.run('вопрос-1');
        await world.run('вопрос-2');

        const edited = await world.run('новый-вопрос-1', first.savedId);

        expect(edited.events.at(-1)?.type).toBe('run-finished');
        expect(await world.history()).toEqual(['новый-вопрос-1', 'новый-ответ-1']);
        expect(world.lastSeen()).toEqual(['новый-вопрос-1']);
    }, 60_000);

    it('editing the second question keeps the first pair in the context', async () => {
        const world = await createWorld(await makeStores(), [
            answer('ответ-1'),
            answer('ответ-2'),
            answer('новый-ответ-2'),
        ]);
        await world.run('вопрос-1');
        const second = await world.run('вопрос-2');

        await world.run('новый-вопрос-2', second.savedId);

        expect(await world.history()).toEqual([
            'вопрос-1',
            'ответ-1',
            'новый-вопрос-2',
            'новый-ответ-2',
        ]);
        expect(world.lastSeen()).toEqual(['вопрос-1', 'ответ-1', 'новый-вопрос-2']);
    }, 60_000);

    it('a question can be edited again, and the next ordinary question continues the new branch', async () => {
        const world = await createWorld(await makeStores(), [
            answer('ответ-1'),
            answer('ответ-2'),
            answer('ответ-2б'),
            answer('ответ-2в'),
            answer('ответ-3'),
        ]);
        await world.run('вопрос-1');
        const second = await world.run('вопрос-2');
        const again = await world.run('вопрос-2б', second.savedId);
        await world.run('вопрос-2в', again.savedId);

        await world.run('вопрос-3');

        expect(await world.history()).toEqual([
            'вопрос-1',
            'ответ-1',
            'вопрос-2в',
            'ответ-2в',
            'вопрос-3',
            'ответ-3',
        ]);
        expect(world.lastSeen()).toEqual([
            'вопрос-1',
            'ответ-1',
            'вопрос-2в',
            'ответ-2в',
            'вопрос-3',
        ]);
    }, 60_000);

    it('a retry after an error leaves one question in the history', async () => {
        const world = await createWorld(await makeStores(), [
            answer('ответ-1'),
            new Error('модель недоступна'),
            answer('ответ-2'),
        ]);
        await world.run('вопрос-1');
        const failed = await world.run('вопрос-2');
        expect(failed.events.at(-1)?.type).toBe('run-failed');
        expect(await world.history()).toEqual(['вопрос-1', 'ответ-1', 'вопрос-2']);

        const retry = await world.run('вопрос-2', failed.savedId);

        expect(retry.events.at(-1)?.type).toBe('run-finished');
        expect(await world.history()).toEqual(['вопрос-1', 'ответ-1', 'вопрос-2', 'ответ-2']);
        expect(world.lastSeen().filter((text) => text === 'вопрос-2')).toHaveLength(1);
    }, 60_000);

    it('a restart during a run answers 409 and leaves the history intact', async () => {
        const world = await createWorld(await makeStores(), [answer('ответ-1')]);
        const first = await world.run('вопрос-1');
        const before = await world.history();
        world.registry.tryStart(world.session.id, 'активный-запуск');

        await expect(world.run('новый-вопрос-1', first.savedId)).rejects.toBeInstanceOf(
            RunConflictError,
        );

        expect(await world.history()).toEqual(before);
        expect(world.registry.isRunning(world.session.id)).toBe(true);
    }, 60_000);

    it('a question stored before the feature cannot be restarted and nothing changes', async () => {
        const stores = await makeStores();
        const world = await createWorld(stores, [answer('ответ-1')]);
        const old = await stores.repo.appendUserMessage(
            world.session.id,
            stores.ownerId,
            'старый вопрос',
        );

        await expect(world.run('новый', String(old.id))).rejects.toThrow();

        expect(await world.history()).toEqual(['старый вопрос']);
        expect(world.registry.isRunning(world.session.id)).toBe(false);
    }, 60_000);
}

describe('restart from a message (in memory)', () => {
    scenarios(() =>
        Promise.resolve({
            repo: new InMemoryChatSessionRepository(),
            saver: new MemorySaver(),
            ownerId: 'owner-1',
        }),
    );
});

describe.skipIf(adminUrl === undefined)('restart from a message (real Postgres)', () => {
    const dbName = `chat_restart_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    let client: Client;
    let pool: DatabasePool;
    let dbUrl = '';
    const savers: PostgresSaver[] = [];

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        dbUrl = withDatabase(adminUrl ?? '', dbName);
        await migrate(dbUrl);
        client = new Client({ connectionString: dbUrl });
        await client.connect();
        pool = await createPool(dbUrl);
    }, 60_000);

    afterAll(async () => {
        await pool.end();
        await client.end();
        await Promise.all(savers.map((saver) => saver.end()));
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    scenarios(async () => {
        const { rows } = await client.query<{ id: string }>(
            `INSERT INTO auth_users (login, password_hash) VALUES ($1, 'h') RETURNING id`,
            [`u-${randomUUID()}`],
        );
        const saver = PostgresSaver.fromConnString(dbUrl);
        await saver.setup();
        savers.push(saver);
        const logger = { setContext: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
        return {
            repo: new ChatSessionRepository(new TransactionRunner(pool, logger)),
            saver,
            ownerId: rows[0]?.id ?? '',
        };
    });
});
