import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { GraphRecursionError, type BaseCheckpointSaver } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';
import type { PinoLogger } from 'nestjs-pino';
import type { Searcher } from '../sheets-qa.config';
import { createSheetTools } from '../application/sheet-tools.factory';
import { AgentEvent, RUN_FAILED_PUBLIC_MESSAGE } from '../domain/agent-event';
import { SheetsAssistantPort } from '../domain/ports/sheets-assistant.port';
import type { RunInput } from '../domain/run-input';
import type { BookLibraryPort } from '../domain/ports/book-library.port';
import { StreamEventMapper } from './map-stream-event';
import { buildLevelSubagents } from './sheets-qa-subagents';
import { buildSheetsQaSystemPrompt } from './sheets-qa-system-prompt';

export interface DeepAgentsSheetsAssistantOptions {
    readonly model: BaseChatModel;
    readonly subagentModel: BaseChatModel;
    readonly library: BookLibraryPort;
    readonly dataDir: string;
    readonly levels: readonly Searcher[];
    readonly maxSteps: number;
    readonly timeoutMs: number;
    readonly maxAnswerChars: number;
    readonly checkpointer: BaseCheckpointSaver;
    readonly logger: PinoLogger;
}

export class DeepAgentsSheetsAssistant extends SheetsAssistantPort {
    constructor(private readonly options: DeepAgentsSheetsAssistantOptions) {
        super();
        this.options.logger.setContext(DeepAgentsSheetsAssistant.name);
    }

    async *stream(input: RunInput, signal: AbortSignal): AsyncGenerator<AgentEvent> {
        const { options } = this;
        const timeoutSignal = AbortSignal.timeout(options.timeoutMs);
        const mapper = new StreamEventMapper();
        yield AgentEvent.runStarted();
        try {
            const catalog = await readFile(join(options.dataDir, 'catalog.md'), 'utf8');
            const tools = createSheetTools(options.library, {
                maxAnswerChars: options.maxAnswerChars,
            });
            const agent = createDeepAgent({
                model: options.model,
                checkpointer: options.checkpointer,
                systemPrompt: buildSheetsQaSystemPrompt(
                    catalog,
                    options.levels,
                    options.library.list(),
                ),
                tools,
                subagents: buildLevelSubagents(options.levels, tools, options.subagentModel),
            });
            const events = agent.streamEvents(
                { messages: [{ role: 'user', content: input.question }] },
                {
                    version: 'v2',
                    recursionLimit: options.maxSteps,
                    signal: AbortSignal.any([signal, timeoutSignal]),
                    configurable: { thread_id: input.threadId },
                },
            );
            for await (const raw of events) {
                if (signal.aborted) break;
                yield* mapper.map(raw);
            }
        } catch (error) {
            yield this.failureOf(error, signal, timeoutSignal, input);
            return;
        }
        // A model that ignores the signal may end the stream normally after an abort.
        if (signal.aborted) {
            yield AgentEvent.runCancelled();
        } else if (timeoutSignal.aborted) {
            yield this.timeoutFailure();
        } else {
            yield mapper.finish();
        }
    }

    private failureOf(
        err: unknown,
        signal: AbortSignal,
        timeoutSignal: AbortSignal,
        input: RunInput,
    ): AgentEvent {
        if (signal.aborted) return AgentEvent.runCancelled();
        if (timeoutSignal.aborted) return this.timeoutFailure();
        if (err instanceof GraphRecursionError) {
            return AgentEvent.runFailed(
                `Агент превысил лимит шагов (${String(this.options.maxSteps)}). Попробуйте сузить вопрос.`,
            );
        }
        this.options.logger.error(
            { err, runId: input.runId, threadId: input.threadId },
            'Agent stream failed',
        );
        return AgentEvent.runFailed(RUN_FAILED_PUBLIC_MESSAGE);
    }

    private timeoutFailure(): AgentEvent {
        const seconds = Math.round(this.options.timeoutMs / 1000);
        return AgentEvent.runFailed(`Превышено время ожидания ответа (${String(seconds)} с)`);
    }
}
