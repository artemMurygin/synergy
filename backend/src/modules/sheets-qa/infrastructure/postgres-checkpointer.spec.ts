import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BaseMessage } from '@langchain/core/messages';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Client } from 'pg';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BookLibraryPort } from '../domain/ports/book-library.port';
import { DeepAgentsSheetsAssistant } from './deepagents-sheets-assistant';
import { RunInput } from '../domain/run-input';
import { PostgresChatThread } from './postgres-chat-thread';

// Интеграционный тест: нужна PostgreSQL. Админский URL задаётся через PROGRAMS_ETL_TEST_ADMIN_URL.
const adminUrl = process.env.PROGRAMS_ETL_TEST_ADMIN_URL;

function withDatabase(url: string, database: string): string {
    const parsed = new URL(url);
    parsed.pathname = `/${database}`;
    return parsed.toString();
}

describe.skipIf(adminUrl === undefined)('PostgresSaver checkpointer', () => {
    const dbName = `chat_cp_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const savers: PostgresSaver[] = [];
    let dbUrl = '';
    let dataDir = '';

    async function createSaver(): Promise<PostgresSaver> {
        const saver = PostgresSaver.fromConnString(dbUrl);
        await saver.setup();
        savers.push(saver);
        return saver;
    }

    function createAssistant(
        model: FakeListChatModel,
        checkpointer: PostgresSaver,
    ): DeepAgentsSheetsAssistant {
        const library = { list: () => [] } as unknown as BookLibraryPort;
        return new DeepAgentsSheetsAssistant({
            model,
            subagentModel: model,
            library,
            dataDir,
            levels: [],
            maxSteps: 50,
            timeoutMs: 20_000,
            maxAnswerChars: 1000,
            checkpointer,
            logger: { setContext: () => undefined } as unknown as PinoLogger,
        });
    }

    /** Runs one question to the end of its stream. */
    async function ask(
        assistant: DeepAgentsSheetsAssistant,
        question: string,
        threadId: string,
    ): Promise<void> {
        const input = RunInput.of({ threadId, runId: randomUUID(), question });
        const events: unknown[] = [];
        for await (const event of assistant.stream(input, new AbortController().signal)) {
            events.push(event);
        }
    }

    const createModel = (): FakeListChatModel => new FakeListChatModel({ responses: ['ответ'] });

    /** Texts of the conversation persisted for the thread; empty when the thread is unknown. */
    async function storedTexts(saver: PostgresSaver, sessionId: string): Promise<string[]> {
        const tuple = await saver.getTuple({ configurable: { thread_id: sessionId } });
        const messages = (tuple?.checkpoint.channel_values.messages ?? []) as BaseMessage[];
        return messages.map((message) => message.text);
    }

    beforeAll(async () => {
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`CREATE DATABASE ${dbName}`);
        await admin.end();
        dbUrl = withDatabase(adminUrl ?? '', dbName);
        dataDir = await mkdtemp(join(tmpdir(), 'chat-cp-'));
        await writeFile(join(dataDir, 'catalog.md'), '# catalog');
    }, 60_000);

    afterAll(async () => {
        await Promise.all(savers.map((saver) => saver.end()));
        const admin = new Client({ connectionString: adminUrl });
        await admin.connect();
        await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        await admin.end();
    });

    it('a second assistant instance continues the conversation of the first', async () => {
        const sessionId = randomUUID();
        await ask(createAssistant(createModel(), await createSaver()), 'первый-вопрос', sessionId);
        const second = await createSaver();
        await ask(createAssistant(createModel(), second), 'второй-вопрос', sessionId);
        const texts = await storedTexts(second, sessionId);
        expect(texts).toContain('первый-вопрос');
        expect(texts).toContain('второй-вопрос');
    }, 60_000);

    it('keeps the contexts of different sessions apart', async () => {
        const saver = await createSaver();
        const [a, b] = [randomUUID(), randomUUID()];
        await ask(createAssistant(createModel(), saver), 'секрет-сессии-А', a);
        await ask(createAssistant(createModel(), saver), 'вопрос-сессии-Б', b);
        expect(await storedTexts(saver, a)).not.toContain('вопрос-сессии-Б');
        const textsB = await storedTexts(saver, b);
        expect(textsB).toContain('вопрос-сессии-Б');
        expect(textsB).not.toContain('секрет-сессии-А');
    }, 60_000);

    it('deleteThread removes the agent context', async () => {
        const saver = await createSaver();
        const sessionId = randomUUID();
        await ask(createAssistant(createModel(), saver), 'забытый-вопрос', sessionId);
        expect(await storedTexts(saver, sessionId)).toContain('забытый-вопрос');
        await new PostgresChatThread(saver).deleteThread(sessionId);
        expect(await storedTexts(saver, sessionId)).toEqual([]);
    }, 60_000);

    it('deleteThread of an unknown thread is not an error', async () => {
        const saver = await createSaver();
        await expect(
            new PostgresChatThread(saver).deleteThread(randomUUID()),
        ).resolves.toBeUndefined();
    });
});
