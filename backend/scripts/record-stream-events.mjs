// Spike for task 1.3 of migrate-sheets-qa-to-ag-ui-assistant-ui.
// Records `createDeepAgent(...).streamEvents(..., {version: 'v2'})` on a scripted fake model
// (one tool `lookup`, one subagent `searcher`) into the fixture used by the stream mapper tests.
// Run: node scripts/record-stream-events.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessageChunk } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { tool } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';
import { z } from 'zod';

class ScriptedChatModel extends BaseChatModel {
    constructor(steps) {
        super({});
        this.steps = steps;
        this.index = 0;
    }
    _llmType() {
        return 'scripted';
    }
    bindTools() {
        return this;
    }
    async _generate(messages, options, runManager) {
        let text = '';
        const calls = [];
        for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
            text += chunk.message.content;
            calls.push(...(chunk.message.tool_calls ?? []));
        }
        const message = new AIMessageChunk({ content: text, tool_calls: calls });
        return { generations: [{ message, text }] };
    }
    async *_streamResponseChunks(_messages, _options, runManager) {
        const step = this.steps[this.index++] ?? { text: [] };
        for (const piece of step.text ?? []) {
            const chunk = new ChatGenerationChunk({
                message: new AIMessageChunk({ content: piece }),
                text: piece,
            });
            yield chunk;
            await runManager?.handleLLMNewToken(piece, undefined, undefined, undefined, undefined, {
                chunk,
            });
        }
        if (step.toolCall !== undefined) {
            // Like a real provider: the first chunk carries id and name, the rest stream the arguments.
            const { id, name, args } = step.toolCall;
            const json = JSON.stringify(args);
            const cut = Math.floor(json.length / 2);
            const parts = [
                { id, name, args: json.slice(0, cut) },
                { args: json.slice(cut) },
            ];
            for (const part of parts) {
                const message = new AIMessageChunk({
                    content: '',
                    tool_call_chunks: [{ ...part, index: 0, type: 'tool_call_chunk' }],
                });
                const chunk = new ChatGenerationChunk({ message, text: '' });
                yield chunk;
                await runManager?.handleLLMNewToken('', undefined, undefined, undefined, undefined, {
                    chunk,
                });
            }
        }
    }
}

const lookup = tool(async ({ query }) => `Результат поиска по «${query}»: Дизайн, 120000 руб.`, {
    name: 'lookup',
    description: 'Search the price list.',
    schema: z.object({ query: z.string() }),
});

const subagentModel = new ScriptedChatModel([
    { toolCall: { id: 'call_lookup_1', name: 'lookup', args: { query: 'дизайн' } } },
    { text: ['1. **Дизайн** — ', '120000 руб.'] },
]);
const model = new ScriptedChatModel([
    {
        text: ['Сейчас проверю. '],
        toolCall: {
            id: 'call_task_1',
            name: 'task',
            args: { description: 'Найди дизайн', subagent_type: 'searcher' },
        },
    },
    { text: ['Нашёл программу: ', 'Дизайн, ', '120000 руб.'] },
]);

const agent = createDeepAgent({
    model,
    checkpointer: new MemorySaver(),
    systemPrompt: 'Ты помощник менеджера.',
    tools: [lookup],
    subagents: [
        {
            name: 'searcher',
            description: 'Ищет программы в прайсе.',
            systemPrompt: 'Ищи через lookup.',
            tools: [lookup],
            model: subagentModel,
        },
    ],
});

const events = [];
const stream = agent.streamEvents(
    { messages: [{ role: 'user', content: 'Сколько стоит дизайн?' }] },
    { version: 'v2', recursionLimit: 50, configurable: { thread_id: 'spike-thread' } },
);
for await (const event of stream) {
    events.push(JSON.parse(JSON.stringify(event)));
}

const out = join(
    dirname(fileURLToPath(import.meta.url)),
    '../src/modules/sheets-qa/infrastructure/testing/stream-events.fixture.json',
);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(events, null, 2) + '\n');
console.log(`recorded ${events.length} events -> ${out}`);
