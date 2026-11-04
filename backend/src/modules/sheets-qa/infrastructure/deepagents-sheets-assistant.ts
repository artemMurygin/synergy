import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { MemorySaver } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';
import type { Searcher } from '../sheets-qa.config';
import { createSheetTools } from '../application/sheet-tools.factory';
import { SheetsAssistantPort, type AssistantAnswer } from '../domain/ports/sheets-assistant.port';
import type { BookLibraryPort } from '../domain/ports/book-library.port';
import { collectToolCalls } from './collect-tool-calls';
import { buildLevelSubagents } from './sheets-qa-subagents';
import { buildSheetsQaSystemPrompt } from './sheets-qa-system-prompt';

export interface DeepAgentsSheetsAssistantOptions {
    readonly model: BaseChatModel;
    /** Model of the level searchers. */
    readonly subagentModel: BaseChatModel;
    readonly library: BookLibraryPort;
    /** Folder with `catalog.md`; read on every question, so edits apply without a restart. */
    readonly dataDir: string;
    /** Education levels and course books; each one is searched by its own subagent, in parallel. */
    readonly levels: readonly Searcher[];
    readonly maxSteps: number;
    readonly timeoutMs: number;
    readonly maxAnswerChars: number;
}

function textOf(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((part: unknown) =>
                typeof part === 'object' && part !== null && 'text' in part
                    ? String(part.text)
                    : '',
            )
            .join('');
    }
    return '';
}

export class DeepAgentsSheetsAssistant extends SheetsAssistantPort {
    /** Conversations live in memory and are lost on restart; swap for PostgresSaver to persist. */
    private readonly checkpointer = new MemorySaver();

    constructor(private readonly options: DeepAgentsSheetsAssistantOptions) {
        super();
    }

    async ask(question: string, sessionId: string): Promise<AssistantAnswer> {
        const { options } = this;
        const startedAt = performance.now();
        const catalog = await readFile(join(options.dataDir, 'catalog.md'), 'utf8');
        const tools = createSheetTools(options.library, {
            maxAnswerChars: options.maxAnswerChars,
        });
        const agent = createDeepAgent({
            model: options.model,
            checkpointer: this.checkpointer,
            systemPrompt: buildSheetsQaSystemPrompt(
                catalog,
                options.levels,
                options.library.list(),
            ),
            tools,
            subagents: buildLevelSubagents(options.levels, tools, options.subagentModel),
        });
        const result = await agent.invoke(
            { messages: [{ role: 'user', content: question }] },
            {
                recursionLimit: options.maxSteps,
                signal: AbortSignal.timeout(options.timeoutMs),
                configurable: { thread_id: sessionId },
            },
        );
        const last = result.messages.at(-1);
        // The state holds the whole conversation; the trace shows only this question.
        const lastHumanIndex = result.messages.findLastIndex(
            (message: { type?: string }) => message.type === 'human',
        );
        return {
            answer: textOf(last?.content).trim(),
            toolCalls: collectToolCalls(result.messages.slice(lastHumanIndex + 1)),
            durationMs: Math.round(performance.now() - startedAt),
        };
    }
}
