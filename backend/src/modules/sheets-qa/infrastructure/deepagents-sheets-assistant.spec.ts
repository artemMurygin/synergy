import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AIMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { fakeModel } from '@langchain/core/testing';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { AgentEvent } from '../domain/agent-event';
import type { BookLibraryPort } from '../domain/ports/book-library.port';
import { RunInput } from '../domain/run-input';
import { DeepAgentsSheetsAssistant } from './deepagents-sheets-assistant';

const input = (threadId = 'thread-1'): RunInput =>
    RunInput.of({ threadId, runId: 'run-1', question: 'Сколько стоит дизайн?' });

async function collect(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
    const events: AgentEvent[] = [];
    for await (const event of stream) events.push(event);
    return events;
}

/** Model that never answers on its own; only an abort ends the run. */
function hangingModel(): FakeListChatModel {
    return new FakeListChatModel({ responses: ['поздно'], sleep: 60_000 });
}

describe('DeepAgentsSheetsAssistant.stream', () => {
    let dataDir = '';
    const library = {
        list: () => [],
        defaultBook: 'book',
    } as unknown as BookLibraryPort;

    beforeAll(async () => {
        dataDir = await mkdtemp(join(tmpdir(), 'assistant-stream-'));
        await writeFile(join(dataDir, 'catalog.md'), '# catalog');
    });

    function create(
        model: ReturnType<typeof fakeModel> | FakeListChatModel,
        overrides: { maxSteps?: number; timeoutMs?: number; checkpointer?: MemorySaver } = {},
    ): DeepAgentsSheetsAssistant {
        return new DeepAgentsSheetsAssistant({
            model,
            subagentModel: model,
            library,
            dataDir,
            levels: [],
            maxSteps: overrides.maxSteps ?? 50,
            timeoutMs: overrides.timeoutMs ?? 20_000,
            maxAnswerChars: 1000,
            checkpointer: overrides.checkpointer ?? new MemorySaver(),
        });
    }

    it('ends a successful run with run-finished carrying the answer', async () => {
        const model = new FakeListChatModel({ responses: ['Дизайн стоит 120000 руб.'] });
        const events = await collect(create(model).stream(input(), new AbortController().signal));
        const last = events.at(-1);
        expect(last?.type).toBe('run-finished');
        if (last?.type !== 'run-finished') return;
        expect(last.answer).toBe('Дизайн стоит 120000 руб.');
        expect(events.filter(AgentEvent.isTerminal)).toHaveLength(1);
    });

    it('turns a model error into run-failed with the error text', async () => {
        const model = fakeModel().alwaysThrow(new Error('модель недоступна'));
        const events = await collect(create(model).stream(input(), new AbortController().signal));
        const last = events.at(-1);
        expect(last?.type).toBe('run-failed');
        if (last?.type !== 'run-failed') return;
        expect(last.message).toContain('модель недоступна');
        expect(events.some((e) => e.type === 'run-finished')).toBe(false);
    });

    it('stops with run-cancelled when the signal is aborted', async () => {
        const controller = new AbortController();
        const pending = collect(create(hangingModel()).stream(input(), controller.signal));
        setTimeout(() => {
            controller.abort();
        }, 100);
        const events = await pending;
        expect(events.at(-1)).toEqual(AgentEvent.runCancelled());
        expect(events.filter(AgentEvent.isTerminal)).toHaveLength(1);
    }, 10_000);

    it('fails with a time-exceeded message on timeout', async () => {
        const events = await collect(
            create(hangingModel(), { timeoutMs: 150 }).stream(
                input(),
                new AbortController().signal,
            ),
        );
        const last = events.at(-1);
        expect(last?.type).toBe('run-failed');
        if (last?.type !== 'run-failed') return;
        expect(last.message).toMatch(/врем/i);
    }, 10_000);

    it('fails with run-failed when recursionLimit is exceeded', async () => {
        const model = fakeModel().respond(
            () =>
                new AIMessage({
                    content: '',
                    tool_calls: [
                        { id: `c-${String(Math.random())}`, name: 'list_books', args: {} },
                    ],
                }),
        );
        const events = await collect(
            create(model, { maxSteps: 5 }).stream(input(), new AbortController().signal),
        );
        expect(events.at(-1)?.type).toBe('run-failed');
    }, 20_000);

    it('uses the threadId as the checkpoint thread_id', async () => {
        const checkpointer = new MemorySaver();
        const model = fakeModel().respond(new AIMessage('ответ'));
        await collect(
            create(model, { checkpointer }).stream(
                input('thread-xyz'),
                new AbortController().signal,
            ),
        );
        const tuple = await checkpointer.getTuple({ configurable: { thread_id: 'thread-xyz' } });
        expect(tuple).toBeDefined();
        const other = await checkpointer.getTuple({ configurable: { thread_id: 'run-1' } });
        expect(other).toBeUndefined();
    });
});
